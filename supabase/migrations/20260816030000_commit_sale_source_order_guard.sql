-- ============================================================================
-- Double-fulfillment guard (2026-08-16)
-- Online orders must never be billed twice (two devices racing to fulfil the
-- same order would otherwise deduct stock twice). commit_sale now refuses to
-- re-insert a sale whose source_order_id already exists, and a partial unique
-- index provides a hard concurrent backstop.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_source_order_id
  ON sales(source_order_id) WHERE source_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION commit_sale(p_sale jsonb, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  h jsonb;
BEGIN
  -- Idempotent fulfilment: never bill the same online order twice.
  IF p_sale->>'source_order_id' IS NOT NULL AND p_sale->>'source_order_id' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid) THEN
      RETURN jsonb_build_object(
        'success', true,
        'id', (SELECT id FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid),
        'already_fulfilled', true
      );
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
