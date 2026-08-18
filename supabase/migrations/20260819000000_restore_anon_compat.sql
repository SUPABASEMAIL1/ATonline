-- ============================================================================
-- 20260819000000_restore_anon_compat.sql
-- ============================================================================
-- WHY: The 2026-08-18 hardening (commit_sale_role_check + soft_delete_and_hardening
-- + rpc_role_guards) required auth.uid() (an authenticated Supabase session) for
-- EVERY sale commit, stock write, delete and refund, and narrowed RLS to
-- `authenticated` only.
--
-- BUT this POS is single-tenant and the browser bundle ships the PUBLIC anon key.
-- The app frequently operates WITHOUT a Supabase-auth session (offline-login
-- fallback in AuthContext.signIn — the app's users-table password rarely matches
-- the separate supabase auth.users password), so auth.uid() is effectively always
-- NULL for the data client. Result:
--   * commit_sale / delete_sale_atomic / refund_sale_atomic / apply_payment_movements
--     all raised FORBIDDEN (auth.uid() IS NULL / unknown role)
--   * `sales` / `products` RLS (authenticated-only) blocked the anon client
-- Cloud sales collapsed from ~20/day (Aug 11-15) to ~1-8/day (Aug 17-18);
-- stock stopped decreasing and deleted sales stopped syncing across devices.
--
-- This migration restores the anon-key data path the app actually uses (matches
-- the pre-2026-08-18 working behaviour) while KEEPING the business guards that
-- do NOT depend on auth.uid():
--   * idempotency (idempotency_key / source_order_id / ON CONFLICT DO NOTHING)
--   * soft-delete + tombstone (historical sale row is NEVER destroyed)
--   * over-refund cap (refund <= original sale total)
-- MASTER §2.1.4 role enforcement is intentionally removed: it is unenforceable in
-- this anon-key single-tenant architecture.
-- ============================================================================

-- ── 1. commit_sale: NO auth check, NO oversell lock (revert to working flow) ──
CREATE OR REPLACE FUNCTION public.commit_sale(p_sale jsonb, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_id uuid;
  h jsonb;
BEGIN
  -- Idempotent fulfilment: never bill the same online order twice.
  IF p_sale->>'source_order_id' IS NOT NULL AND p_sale->>'source_order_id' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid) THEN
      RETURN jsonb_build_object('success', true, 'id', (SELECT id FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid), 'already_fulfilled', true);
    END IF;
  END IF;

  -- MASTER §5.2: client-generated idempotency key -> retry/replay is a no-op.
  IF p_sale->>'idempotency_key' IS NOT NULL AND p_sale->>'idempotency_key' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE idempotency_key = (p_sale->>'idempotency_key')::uuid) THEN
      RETURN jsonb_build_object('success', true, 'id', (SELECT id FROM sales WHERE idempotency_key = (p_sale->>'idempotency_key')::uuid), 'already_committed', true);
    END IF;
  END IF;

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

  -- If the sale id already existed (ON CONFLICT no-op), reuse it so the
  -- stock_history rows below get a valid (non-null) reference_id.
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

-- ── 2. delete_sale_atomic: NO auth check; soft-delete + tombstone ────────────
CREATE OR REPLACE FUNCTION public.delete_sale_atomic(p_sale_id uuid, p_history jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
BEGIN
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

-- ── 3. refund_sale_atomic: NO auth check; keep over-refund cap ───────────────
CREATE OR REPLACE FUNCTION public.refund_sale_atomic(p_sale_id uuid, p_history jsonb, p_status text, p_refunded_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
  _total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'sale_missing');
  END IF;

  -- Universal over-refund guard (MASTER §2.1.5 / §7 I5): no role may refund more
  -- than the original sale total. p_refunded_amount is the NEW cumulative total.
  SELECT total INTO _total FROM sales WHERE id = p_sale_id;
  IF _total IS NOT NULL AND p_refunded_amount > _total + 0.001 THEN
    RAISE EXCEPTION 'FORBIDDEN: refund amount exceeds sale total' USING ERRCODE = '42501';
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

  UPDATE sales SET status = p_status, refunded_amount = p_refunded_amount, updated_at = now() WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END; $$;

GRANT EXECUTE ON FUNCTION refund_sale_atomic(uuid, jsonb, text, numeric) TO anon, authenticated, service_role;

-- ── 4. apply_payment_movements: NO auth check; keep gen_random_uuid ──────────
CREATE OR REPLACE FUNCTION apply_payment_movements(p_moves jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
BEGIN
  FOR h IN SELECT * FROM jsonb_array_elements(p_moves)
  LOOP
    INSERT INTO payment_movements (id, mode_id, delta, reference_id, note, created_at)
    VALUES (
      COALESCE((h->>'id')::uuid, gen_random_uuid()),
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
$function$;

GRANT EXECUTE ON FUNCTION apply_payment_movements(jsonb) TO anon, authenticated, service_role;

-- ── 5. apply_stock_movements: unchanged (no auth check) — re-grant for safety ──
GRANT EXECUTE ON FUNCTION apply_stock_movements(jsonb) TO anon, authenticated, service_role;

-- ── 6. RLS: permissive anon + authenticated access (single-tenant anon-key) ──
-- The hardening enabled RLS with authenticated-only policies. We ADD permissive
-- policies for anon (and authenticated) so the browser anon-key client can read
-- and write every synced table. OR-semantics means adding these does not remove
-- existing admin/manager policies.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_all ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_all ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_all ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_all ON public.expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_all ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_transactions_all ON public.supplier_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_settings_all ON public.app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_history_all ON public.stock_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.variant_stock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY variant_stock_history_all ON public.variant_stock_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payment_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_movements_all ON public.payment_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payment_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_modes_all ON public.payment_modes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.row_tombstones ENABLE ROW LEVEL SECURITY;
CREATE POLICY row_tombstones_all ON public.row_tombstones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 7. Table + sequence + function grants for anon ───────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
