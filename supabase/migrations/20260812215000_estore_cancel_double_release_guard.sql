-- 2026-08-12 Financial Integrity Sweep: Estore cancel double-release guard
-- Issue: trigger_release_estore_stock released +qty on ANY transition to 'cancelled'.
-- If an order was already FULFILLED (sale converted — goods sold, stock already
-- deducted at sale commit / restored at sale refund), cancelling the order released
-- stock a second time (net stock inflation).
-- Fix: only release reservation stock when the order was NEVER fulfilled.
CREATE OR REPLACE FUNCTION public.trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
BEGIN
    -- If status changed to cancelled AND the order was never fulfilled
    -- (fulfilled orders already route stock through the sale/refund ledger)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
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
EXECUTE FUNCTION public.trigger_release_estore_stock();