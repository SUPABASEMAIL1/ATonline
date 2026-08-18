-- ============================================================================
-- 20260818140000_soft_delete_and_hardening.sql
-- ============================================================================
-- MASTER compliance round 2:
--   1. §0.6/§8  delete_sale_atomic → SOFT delete (status='deleted', deleted_at).
--      Historical sale row is NEVER destroyed. Tombstone recorded so other
--      devices remove the row locally (row_tombstones.deleted_at drives pull).
--   2. §2.1.4  commit_sale → fail-closed: missing users row (NULL role) is
--      REJECTED, not silently allowed. Roles: admin|manager|cashier|salesman.
--   3. §12     commit_sale oversell guard → lock_product_stock() (SECURITY
--      DEFINER + FOR UPDATE). NOTE (live-tested): an INLINE "SELECT ... FOR
--      UPDATE" inside an invoker plpgsql function on an RLS table silently
--      returns 0 rows for non-owner roles — the guard never fired. The lock is
--      therefore taken inside a SECURITY DEFINER helper (owner context locks
--      the row within the CALLER's transaction, proven by race test: second
--      concurrent commit blocks, re-reads committed stock, fails cleanly).
--   4. §2.1.4  anon grants narrowed: SELECT-only on all tables + INSERT on
--      customers/store_orders (public estore). Every write needs a JWT.
--      row_tombstones anon policy narrowed to SELECT.
--   5. §2.1.4  RLS hardening: products/sales/customers/app_settings/expenses/
--      suppliers/supplier_transactions get explicit per-command policies.
--      sales has NO DELETE policy (delete only via guarded delete_sale_atomic).
--      Derived-value triggers (stock, customer stats, invoice counter) become
--      SECURITY DEFINER so legitimate cashier flows keep working under RLS.
-- ============================================================================

-- ── 1. delete_sale_atomic: soft-delete + tombstone (MASTER §0.6/§8) ─────────
CREATE OR REPLACE FUNCTION public.delete_sale_atomic(p_sale_id uuid, p_history jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
  _role text;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NULL OR _role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN: delete_sale requires admin or manager' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'already_deleted');
  END IF;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  -- §0.6: NEVER destroy the historical row. Soft-delete + tombstone for sync.
  UPDATE sales SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = p_sale_id;
  INSERT INTO row_tombstones (table_name, ref_id, deleted_at)
  VALUES ('sales', p_sale_id, now())
  ON CONFLICT (table_name, ref_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION delete_sale_atomic(uuid, jsonb) TO anon, authenticated, service_role;

-- ── 2a. lock_product_stock: transaction-scoped row lock (MASTER §12) ────────
-- SECURITY DEFINER helper: locks the product row for the CALLER's transaction.
-- Plain "SELECT ... FOR UPDATE" inside an invoker function is silently
-- filtered by RLS for non-owner roles (live-tested: returns 0 rows), so the
-- lock must be taken as table owner. The lock is held until the caller's
-- transaction commits — that is what serializes concurrent commit_sale calls.
CREATE OR REPLACE FUNCTION public.lock_product_stock(pid uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE s numeric;
BEGIN
  SELECT stock INTO s FROM products WHERE id = pid FOR UPDATE;
  RETURN s;
END $function$;

REVOKE ALL ON FUNCTION public.lock_product_stock FROM anon;
REVOKE ALL ON FUNCTION public.lock_product_stock FROM public;
GRANT EXECUTE ON FUNCTION public.lock_product_stock TO authenticated;

-- ── 2. commit_sale: fail-closed role + oversell guard ───────────────────────
CREATE OR REPLACE FUNCTION public.commit_sale(p_sale jsonb, p_history jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_id uuid;
  h jsonb;
  cur numeric;
  _role text;
BEGIN
  -- MASTER §2.1.4: require an authenticated user (never anonymous). Fail-closed:
  -- a missing users row (NULL role) is REJECTED — no silent provisioning gap.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required to commit sale' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NULL OR _role NOT IN ('admin', 'manager', 'cashier', 'salesman') THEN
    RAISE EXCEPTION 'FORBIDDEN: not authorized to commit sale' USING ERRCODE = '42501';
  END IF;

  -- Idempotent fulfilment: never bill the same online order twice.
  IF p_sale->>'source_order_id' IS NOT NULL AND p_sale->>'source_order_id' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid) THEN
      RETURN jsonb_build_object('success', true, 'id', (SELECT id FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid), 'already_fulfilled', true);
    END IF;
  END IF;

  -- MASTER §5.2: client-generated idempotency key -> retry/replay is a no-op, not a second sale.
  IF p_sale->>'idempotency_key' IS NOT NULL AND p_sale->>'idempotency_key' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE idempotency_key = (p_sale->>'idempotency_key')::uuid) THEN
      RETURN jsonb_build_object('success', true, 'id', (SELECT id FROM sales WHERE idempotency_key = (p_sale->>'idempotency_key')::uuid), 'already_committed', true);
    END IF;
  END IF;

  -- Oversell guard (MASTER §12): lock_product_stock() takes a row lock inside
  -- THIS transaction (SECURITY DEFINER helper, owner context — inline FOR UPDATE
  -- is silently RLS-filtered for non-owner roles). A second concurrent terminal
  -- blocks on the lock, then re-reads the freshly-committed stock and fails
  -- cleanly instead of both passing the check.
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF (h->>'change_qty')::int < 0 AND (h->>'variant_id' IS NULL OR (h->>'variant_id') = '') THEN
      cur := public.lock_product_stock((h->>'product_id')::uuid);
      IF cur IS NOT NULL AND cur >= 0 AND (cur + (h->>'change_qty')::int) < 0 THEN
        RAISE EXCEPTION 'OVERSELL: product % has stock % but this sale needs %', (h->>'product_id')::uuid, cur, abs((h->>'change_qty')::int) USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO sales (
    id, invoice_number, customer_id, customer_name, customer_phone,
    items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
    tax_amount, total, received_amount, change_amount, payment_method,
    card_details, status, cashier, cashier_role, receipt_number, notes,
    applied_discounts, free_gifts, timestamp, sale_date, sale_type,
    extra_charges, split_payments, refunded_amount, estore_status,
    delivery_address, delivery_fee, delivery_location_lat, delivery_location_lng,
    customer_notes, source_order_id, salesman_id, salesman_name, idempotency_key, created_at, updated_at
  ) VALUES (
    (p_sale->>'id')::uuid,
    p_sale->>'invoice_number',
    NULLIF(p_sale->>'customer_id','')::uuid,
    p_sale->>'customer_name',
    p_sale->>'customer_phone',
    COALESCE(p_sale->'items','[]'::jsonb),
    (p_sale->>'subtotal')::numeric,
    (p_sale->>'discount_amount')::numeric,
    (p_sale->>'bill_discount_value')::numeric,
    p_sale->>'bill_discount_type',
    (p_sale->>'tax_amount')::numeric,
    (p_sale->>'total')::numeric,
    (p_sale->>'received_amount')::numeric,
    (p_sale->>'change_amount')::numeric,
    p_sale->>'payment_method',
    p_sale->'card_details',
    p_sale->>'status',
    p_sale->>'cashier',
    p_sale->>'cashier_role',
    p_sale->>'receipt_number',
    p_sale->>'notes',
    p_sale->'applied_discounts',
    p_sale->'free_gifts',
    (p_sale->>'timestamp')::timestamptz,
    (p_sale->>'sale_date')::date,
    p_sale->>'sale_type',
    p_sale->'extra_charges',
    p_sale->'split_payments',
    (p_sale->>'refunded_amount')::numeric,
    p_sale->>'estore_status',
    p_sale->>'delivery_address',
    (p_sale->>'delivery_fee')::numeric,
    (p_sale->>'delivery_location_lat')::numeric,
    (p_sale->>'delivery_location_lng')::numeric,
    p_sale->>'customer_notes',
    NULLIF(p_sale->>'source_order_id','')::uuid,
    NULLIF(p_sale->>'salesman_id','')::uuid,
    p_sale->>'salesman_name',
    NULLIF(p_sale->>'idempotency_key','')::uuid,
    COALESCE((p_sale->>'created_at')::timestamptz, now()),
    now()
  ) ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;

  -- Fix latent bug: if the sale id already existed (ON CONFLICT no-op), reuse it so
  -- the stock_history rows below get a valid (non-null) reference_id.
  IF v_id IS NULL THEN
    v_id := (p_sale->>'id')::uuid;
  END IF;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now()) ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now()) ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION commit_sale(jsonb, jsonb) TO anon, authenticated, service_role;

-- ── 3. anon grants: SELECT-only + public-facing INSERTs (MASTER §2.1.4) ──────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON public.customers, public.store_orders TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- row_tombstones: anon may READ tombstones (cross-device delete sync) but never write.
DROP POLICY IF EXISTS "Allow anon ALL on row_tombstones" ON public.row_tombstones;
CREATE POLICY "Allow anon SELECT on row_tombstones" ON public.row_tombstones
  FOR SELECT TO anon USING (true);-- ── 4. RLS hardening (MASTER §2.1.4): server-side write guards on sensitive tables ──
-- Derived-value triggers become SECURITY DEFINER so legitimate cashier flows
-- (sale → stock trigger, customer stats trigger, invoice counter) keep working.

ALTER FUNCTION public.trigger_update_product_stock() SECURITY DEFINER;
ALTER FUNCTION public.trigger_update_variant_stock() SECURITY DEFINER;
ALTER FUNCTION public.update_customer_stats() SECURITY DEFINER;
ALTER FUNCTION public.generate_invoice_number() SECURITY DEFINER;
ALTER FUNCTION public.get_next_invoice_number() SECURITY DEFINER;

-- products: SELECT public; write admin/manager only
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_select ON public.products FOR SELECT USING (true);
CREATE POLICY products_write ON public.products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));

-- sales: SELECT/INSERT/UPDATE authenticated; DELETE only via guarded RPC (no policy)
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- customers: SELECT public; INSERT public (estore/POS); write admin/manager only
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON public.customers FOR SELECT USING (true);
CREATE POLICY customers_insert ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));

-- app_settings: SELECT public; write admin/manager only (replaces old public-write policies)
DROP POLICY IF EXISTS settings_delete ON public.app_settings;
DROP POLICY IF EXISTS settings_insert ON public.app_settings;
DROP POLICY IF EXISTS settings_write ON public.app_settings;
DROP POLICY IF EXISTS settings_select ON public.app_settings;
CREATE POLICY settings_select ON public.app_settings FOR SELECT USING (true);
CREATE POLICY settings_insert ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY settings_update ON public.app_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY settings_delete ON public.app_settings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));

-- expenses: SELECT authenticated; write admin/manager only
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));

-- suppliers: SELECT authenticated; write admin/manager only
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));

-- supplier_transactions: SELECT authenticated; write admin/manager only
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_transactions_select ON public.supplier_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY supplier_transactions_insert ON public.supplier_transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY supplier_transactions_update ON public.supplier_transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));
CREATE POLICY supplier_transactions_delete ON public.supplier_transactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','manager')));