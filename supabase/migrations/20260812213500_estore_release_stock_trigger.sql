-- Trigger to release stock when an estore order is cancelled
CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
BEGIN
    -- If status changed to cancelled
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        -- Loop through items to restore stock
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            -- Check if product tracks inventory
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;
            
            IF product_rec.track_inventory = true THEN
                INSERT INTO stock_history (
                    product_id, change_qty, type, reference_id, note, cashier_name
                ) VALUES (
                    product_rec.id,
                    (item->>'quantity')::integer,
                    'return',
                    NEW.id::text,
                    'Estore Order Cancelled: ' || NEW.invoice_number,
                    'System'
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_store_order_cancelled ON store_orders;
CREATE TRIGGER on_store_order_cancelled
AFTER UPDATE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_release_estore_stock();
