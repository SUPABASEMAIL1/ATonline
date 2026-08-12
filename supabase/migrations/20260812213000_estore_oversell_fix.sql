-- Fix Estore Oversell Bug: Reserve stock upon order placement
CREATE OR REPLACE FUNCTION place_estore_order(order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_order_id uuid;
    item jsonb;
    product_rec record;
    new_stock integer;
BEGIN
    -- 1. Insert into store_orders
    INSERT INTO store_orders (
        invoice_number, customer_id, customer_name, customer_phone,
        address, customer_notes, items, subtotal, discount_amount,
        tax_amount, total, payment_method, status, cashier,
        delivery_location_lat, delivery_location_lng,
        delivery_fee, table_number, fulfillment_mode
    ) VALUES (
        order_data->>'invoice_number',
        (order_data->>'customer_id')::uuid,
        order_data->>'customer_name',
        order_data->>'customer_phone',
        order_data->>'address',
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
        (order_data->>'delivery_fee')::numeric,
        order_data->>'table_number',
        order_data->>'fulfillment_mode'
    ) RETURNING id INTO new_order_id;

    -- 2. Deduct stock for each item by inserting into stock_history
    -- (The on_stock_history_insert trigger will automatically update products.stock)
    FOR item IN SELECT * FROM jsonb_array_elements(order_data->'items')
    LOOP
        -- Check if product tracks inventory
        SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;
        
        IF product_rec.track_inventory = true THEN
            INSERT INTO stock_history (
                product_id, change_qty, type, reference_id, note, cashier_name
            ) VALUES (
                product_rec.id,
                -((item->>'quantity')::integer),
                'sale',
                new_order_id::text,
                'Estore Reservation: ' || (order_data->>'invoice_number'),
                'ONLINE_STORE'
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', new_order_id);
END;
$$;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION place_estore_order(jsonb) TO anon;
