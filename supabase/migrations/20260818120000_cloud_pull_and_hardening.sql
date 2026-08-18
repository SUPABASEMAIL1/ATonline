-- ============================================================================
-- cloud_pull_and_hardening (2026-08-18)
-- 1. variant_stock_history idempotency index (MASTER §4/§6 — was missing)
-- 2. process_return idempotency: SET (cumulative) instead of += (double-post fix)
-- 3. apply_stock_movements / apply_payment_movements role guards (MASTER §2)
-- 4. users RLS + role-escalation guard (MASTER §2 — anon could rewrite roles)
-- 5. Realtime publication for cross-device pull engine (cloudPull.ts)
-- 6. backfill_payment_movements() RPC — reconstruct wallet ledger from sales
--    split_payments + expenses (MASTER §6 — jeanzone had only 15 ledger rows)
-- ============================================================================

-- ── 1. variant_stock_history idempotency index ────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_variant_stock_history_idem
  ON variant_stock_history(reference_id, product_id, variant_id, type)
  WHERE reference_id IS NOT NULL AND type <> 'adjustment';

-- ── 2. process_return: idempotent (SET cumulative, never +=) ───────────────
-- Client always sends the CUMULATIVE refunded_amount (services.ts builds
-- newRefundedAmount = old + delta before calling). += double-counts on retry.
CREATE OR REPLACE FUNCTION public.process_return(sale_id uuid, return_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT;
    v_refunded_amount DECIMAL(12,2);
    _role text;
BEGIN
    SELECT role INTO _role FROM public.users WHERE id = auth.uid();
    IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier') THEN
      RAISE EXCEPTION 'FORBIDDEN: return requires cashier or higher' USING ERRCODE = '42501';
    END IF;
    v_status := COALESCE(return_data->>'status', 'refunded');
    v_refunded_amount := COALESCE((return_data->>'refundedAmount')::DECIMAL(12,2), 0);
    UPDATE sales SET
        status = v_status,
        refunded_amount = v_refunded_amount,
        items = COALESCE(return_data->>'items', items::TEXT)::JSONB,
        notes = COALESCE(notes, '') || E'\n[RETURNED] ' || COALESCE(return_data->>'notes', ''),
        updated_at = NOW()
    WHERE id = sale_id;
    RETURN jsonb_build_object('success', true, 'id', sale_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

-- ── 3a. apply_stock_movements role guard ───────────────────────────────────
CREATE OR REPLACE FUNCTION apply_stock_movements(p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  h jsonb;
  _role text;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN: stock movements require cashier or higher' USING ERRCODE = '42501';
  END IF;
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now()) ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now()) ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 3b. apply_payment_movements role guard ─────────────────────────────────
CREATE OR REPLACE FUNCTION apply_payment_movements(p_moves jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  h jsonb;
  _role text;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN: payment movements require cashier or higher' USING ERRCODE = '42501';
  END IF;
  FOR h IN SELECT * FROM jsonb_array_elements(p_moves)
  LOOP
    INSERT INTO payment_movements (id, mode_id, delta, reference_id, note, created_at)
    VALUES (
      COALESCE((h->>'id')::uuid, uuid_generate_v4()),
      h->>'mode_id',
      (h->>'delta')::numeric,
      NULLIF(h->>'reference_id','')::uuid,
      h->>'note',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN
      UPDATE payment_modes SET balance = balance + (h->>'delta')::numeric, updated_at = now()
      WHERE id = h->>'mode_id';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 4. users RLS + role-escalation guard ───────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_all" ON users;
DROP POLICY IF EXISTS "users_update_self_or_admin" ON users;
DROP POLICY IF EXISTS "users_insert_open" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;

-- SyncEngine needs to read all users on every device (offline auth, roles).
CREATE POLICY "users_select_all" ON users FOR SELECT USING (true);
-- A user may update themselves; admins/managers may update anyone.
CREATE POLICY "users_update_self_or_admin" ON users FOR UPDATE
  USING (auth.uid() = id OR current_user_role() IN ('admin', 'manager'))
  WITH CHECK (auth.uid() = id OR current_user_role() IN ('admin', 'manager'));
-- First-run setup: signup trigger inserts via service role (bypasses RLS),
-- but keep INSERT open for legacy flows.
CREATE POLICY "users_insert_open" ON users FOR INSERT WITH CHECK (true);
-- Only admins may delete users.
CREATE POLICY "users_delete_admin" ON users FOR DELETE
  USING (current_user_role() = 'admin');

-- Role-escalation guard: only admin/manager may change role / active flag.
-- Cashiers editing their own row cannot self-promote.
CREATE OR REPLACE FUNCTION guard_user_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.active IS DISTINCT FROM NEW.active THEN
    IF current_user_role() NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION 'FORBIDDEN: only admin/manager may change roles or active status' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_role_change ON users;
CREATE TRIGGER trg_guard_user_role_change
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_user_role_change();

-- ── 5. Realtime publication (cross-device instant sync) ────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','customers','sales','store_orders','expenses','suppliers',
    'categories','discounts','purchase_records','salesmen','users',
    'app_settings','payments','supplier_transactions','stock_history',
    'variant_stock_history','product_addons','bundles','row_tombstones'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ── 6. Wallet ledger backfill (idempotent, reconstruct + recompute) ────────
CREATE OR REPLACE FUNCTION backfill_payment_movements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  mv record;
  v_mode_id text;
  delta_val numeric;
  inserted int := 0;
  skipped int := 0;
BEGIN
  -- Only admins may run the backfill.
  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: backfill requires admin' USING ERRCODE = '42501';
  END IF;

  -- 6a. Sales → IN movements (split payments honoured).
  FOR r IN
    SELECT id, invoice_number, total, payment_method, split_payments, refunded_amount, status
    FROM sales
    WHERE deleted_at IS NULL AND status <> 'cancelled'
  LOOP
    IF r.split_payments IS NOT NULL AND jsonb_array_length(r.split_payments) > 0 THEN
      FOR mv IN SELECT value AS item FROM jsonb_array_elements(r.split_payments)
      LOOP
        v_mode_id := CASE WHEN (mv.item->>'method') IN ('digital','wallet') THEN 'online' ELSE COALESCE(mv.item->>'method','cash') END;
        delta_val := COALESCE((mv.item->>'amount')::numeric, 0);
        IF NOT EXISTS (SELECT 1 FROM payment_movements pmx WHERE pmx.reference_id = r.id AND pmx.mode_id = v_mode_id AND pmx.note = 'Sale ' || COALESCE(r.invoice_number,'')) THEN
          INSERT INTO payment_movements (mode_id, delta, reference_id, note, created_at)
          VALUES (v_mode_id, delta_val, r.id, 'Sale ' || COALESCE(r.invoice_number,''), now());
          inserted := inserted + 1;
        ELSE
          skipped := skipped + 1;
        END IF;
      END LOOP;
    ELSE
      v_mode_id := CASE WHEN r.payment_method IN ('digital','wallet') THEN 'online' ELSE COALESCE(r.payment_method,'cash') END;
      IF v_mode_id = 'split' THEN v_mode_id := 'cash'; END IF;
      IF NOT EXISTS (SELECT 1 FROM payment_movements pmx WHERE pmx.reference_id = r.id AND pmx.mode_id = v_mode_id AND pmx.note = 'Sale ' || COALESCE(r.invoice_number,'')) THEN
        INSERT INTO payment_movements (mode_id, delta, reference_id, note, created_at)
        VALUES (v_mode_id, COALESCE(r.total, 0), r.id, 'Sale ' || COALESCE(r.invoice_number,''), now());
        inserted := inserted + 1;
      ELSE
        skipped := skipped + 1;
      END IF;
    END IF;
  END LOOP;

  -- 6b. Refunds → reverse movements (only when refunded_amount > 0).
  FOR r IN
    SELECT id, invoice_number, payment_method, refunded_amount
    FROM sales
    WHERE deleted_at IS NULL AND COALESCE(refunded_amount, 0) > 0
  LOOP
    v_mode_id := CASE WHEN r.payment_method IN ('digital','wallet') THEN 'online' ELSE COALESCE(r.payment_method,'cash') END;
    IF v_mode_id = 'split' THEN v_mode_id := 'cash'; END IF;
    IF NOT EXISTS (SELECT 1 FROM payment_movements pmx WHERE pmx.reference_id = r.id AND pmx.mode_id = v_mode_id AND pmx.note = 'Reverse ' || COALESCE(r.invoice_number,'')) THEN
      INSERT INTO payment_movements (mode_id, delta, reference_id, note, created_at)
      VALUES (v_mode_id, -COALESCE(r.refunded_amount, 0), r.id, 'Reverse ' || COALESCE(r.invoice_number,''), now());
      inserted := inserted + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;

  -- 6c. Expenses → OUT movements.
  FOR r IN
    SELECT id, description, amount, payment_method
    FROM expenses
  LOOP
    v_mode_id := CASE WHEN r.payment_method IN ('digital','wallet') THEN 'online' ELSE COALESCE(r.payment_method,'cash') END;
    IF NOT EXISTS (SELECT 1 FROM payment_movements WHERE reference_id = r.id AND note = 'Expense ' || COALESCE(r.description,'Expense')) THEN
      INSERT INTO payment_movements (mode_id, delta, reference_id, note, created_at)
      VALUES (v_mode_id, -COALESCE(r.amount, 0), r.id, 'Expense ' || COALESCE(r.description,'Expense'), now());
      inserted := inserted + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;

  -- 6d. Recompute authoritative balances from the ledger.
  UPDATE payment_modes pm
  SET balance = COALESCE((SELECT SUM(delta) FROM payment_movements WHERE mode_id = pm.id), 0),
      updated_at = now();

  RETURN jsonb_build_object('success', true, 'inserted', inserted, 'skipped', skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_payment_movements() TO anon, authenticated, service_role;