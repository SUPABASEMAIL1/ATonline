-- ============================================================================
-- commit_sale_role_check (MASTER §2.1.4)
-- commit_sale now re-checks authorization server-side (the app calls it with
-- the anon-key client + the user's JWT, so auth.uid() is always the logged-in
-- user). Anonymous calls (auth.uid() IS NULL) are rejected. Unknown roles are
-- fail-closed; provisioning-gap accounts (no public.users row) are still allowed
-- so legitimate sales are never blocked. Combined with the §5.2 idempotency key
-- and the oversell guard, this closes the last per-RPC gap on the sale path.
-- Applied live 2026-08-17.
-- ============================================================================

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
  -- MASTER §2.1.4: require an authenticated user (never anonymous). Fail-closed
  -- for unknown roles; provisioning-gap accounts (no users row) are still allowed
  -- so legitimate sales are never blocked.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required to commit sale' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier', 'salesman') THEN
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

  -- Oversell guard: block if net movement would drive a tracked product's cloud stock negative.
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF (h->>'change_qty')::int < 0 AND (h->>'variant_id' IS NULL OR (h->>'variant_id') = '') THEN
      SELECT stock INTO cur FROM products WHERE id = (h->>'product_id')::uuid;
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
