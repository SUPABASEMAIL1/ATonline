-- ============================================================================
-- Atomic Sale & Stock Commit RPCs (Phase 1 — Online-Authoritative foundation)
-- Created: 2026-08-16
-- WHY: The old flow wrote a sale row AND a separate stock_history row as two
--      independent queued ops. If either op got stuck (the 'error' bug in
--      syncEngine), cloud stock diverged from sales forever. These RPCs commit
--      the sale + ALL its stock movements inside ONE Postgres transaction, so
--      products.stock / variant_data can NEVER diverge from sales.
-- Cloud stock is still maintained by the existing stock_history / variant_stock_history
-- triggers (trigger_update_product_stock / trigger_update_variant_stock).
-- IDEMPOTENT: each movement carries its own id (from the app) via COALESCE, so a
--             retry / fallback queue insert hits a 23505 duplicate and is ignored
--             (no double stock deduction).
-- ============================================================================

-- Atomic sale commit: inserts the sale row + every stock movement in a single tx.
CREATE OR REPLACE FUNCTION commit_sale(p_sale jsonb, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  h jsonb;
BEGIN
  INSERT INTO sales (
    id, invoice_number, customer_id, customer_name, customer_phone,
    items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
    tax_amount, total, received_amount, change_amount, payment_method,
    card_details, status, cashier, cashier_role, receipt_number, notes,
    applied_discounts, free_gifts, timestamp, sale_date, sale_type,
    extra_charges, split_payments, refunded_amount, estore_status,
    delivery_address, delivery_fee, delivery_location_lat, delivery_location_lng,
    customer_notes, source_order_id, salesman_id, salesman_name, created_at, updated_at
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
    COALESCE((p_sale->>'created_at')::timestamptz, now()),
    now()
  ) RETURNING id INTO v_id;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now());
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now());
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- Generic stock movement (returns, stock-in, manual adjustments). All rows in one tx.
CREATE OR REPLACE FUNCTION apply_stock_movements(p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  h jsonb;
BEGIN
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now());
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now());
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_sale(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_stock_movements(jsonb) TO anon, authenticated, service_role;
