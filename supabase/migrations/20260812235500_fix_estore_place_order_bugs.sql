-- 20260812235500_fix_estore_place_order_bugs.sql
-- 🐛 FIX (found by TESTS_GUIDE full-system-flow battery, 2026-08-12):
--   1. place_estore_order referenced columns (address, table_number, fulfillment_mode)
--      that DON'T EXIST in store_orders → EVERY online order placement failed.
--      App sends 'delivery_address' (toRemoteStoreOrder) — switch to that column.
--   2. reference_id is UUID; both functions cast ::text → every tracked-product
--      order AND every cancel raised 42804 → stock reservation/release never happened.
--   3. F22 note: estore reservation deducts via stock_history (product-level) —
--      variant items would silently not reserve; app routes variant orders
--      through variant_stock_history on the POS side; RPC reserves products only.

CREATE OR REPLACE FUNCTION place_estore_order(order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_order_id uuid;
    item jsonb;
    product_rec record;
    variant_rec record;
BEGIN
    -- 1. Insert into store_orders
    INSERT INTO store_orders (
        invoice_number, customer_id, customer_name, customer_phone,
        delivery_address, customer_notes, items, subtotal, discount_amount,
        tax_amount, total, payment_method, status, cashier,
        delivery_location_lat, delivery_location_lng, delivery_fee
    ) VALUES (
        order_data->>'invoice_number',
        (order_data->>'customer_id')::uuid,
        order_data->>'customer_name',
        order_data->>'customer_phone',
        COALESCE(order_data->>'delivery_address', order_data->>'address'),
        order_data->>'customer_notes',
        order_data->'items',
        (order_data->>'subtotal')::numeric,
        (order_data->>'discount_amount')::numeric,
        (order_data->>'tax_amount')::numeric,
        (order_data->>'total')::numeric,
        order_data->>'payment_method',
        order_data->>'status',
        order_data->>'cashier',
        (order_data->>'delivery_location_lat')::numeric,
        (order_data->>'delivery_location_lng')::numeric,
        (order_data->>'delivery_fee')::numeric
    ) RETURNING id INTO new_order_id;

    -- 2. Reserve stock for each tracked item (F22: variant-aware)
    --    product-level stock → stock_history (trigger updates products.stock)
    --    variant item    → variant_stock_history (trigger updates variant_data)
    FOR item IN SELECT * FROM jsonb_array_elements(order_data->'items')
    LOOP
        SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;
        IF product_rec.track_inventory IS TRUE THEN
            IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                INSERT INTO variant_stock_history (
                    product_id, variant_id, variant_label, change_qty, type,
                    reference_id, note, cashier_name
                ) VALUES (
                    product_rec.id,
                    item->>'variantId',
                    item->>'variantLabel',
                    -((item->>'quantity')::integer),
                    'sale',
                    new_order_id,
                    'Estore Reservation: ' || (order_data->>'invoice_number'),
                    'ONLINE_STORE'
                );
            ELSE
                INSERT INTO stock_history (
                    product_id, change_qty, type, reference_id, note, cashier_name
                ) VALUES (
                    product_rec.id,
                    -((item->>'quantity')::integer),
                    'sale',
                    new_order_id,
                    'Estore Reservation: ' || (order_data->>'invoice_number'),
                    'ONLINE_STORE'
                );
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', new_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION place_estore_order(jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;
            IF product_rec.track_inventory IS TRUE THEN
                IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                    INSERT INTO variant_stock_history (
                        product_id, variant_id, variant_label, change_qty, type,
                        reference_id, note, cashier_name
                    ) VALUES (
                        product_rec.id,
                        item->>'variantId',
                        item->>'variantLabel',
                        (item->>'quantity')::integer,
                        'return',
                        NEW.id,
                        'Estore Order Cancelled: ' || NEW.invoice_number,
                        'System'
                    );
                ELSE
                    INSERT INTO stock_history (
                        product_id, change_qty, type, reference_id, note, cashier_name
                    ) VALUES (
                        product_rec.id,
                        (item->>'quantity')::integer,
                        'return',
                        NEW.id,
                        'Estore Order Cancelled: ' || NEW.invoice_number,
                        'System'
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;