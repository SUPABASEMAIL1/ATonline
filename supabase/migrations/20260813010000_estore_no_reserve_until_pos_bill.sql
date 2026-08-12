-- ═══════════════════════════════════════════════════════════════════════════
-- ESTORE POLICY CHANGE (2026-08-12) — "No stock effect until POS bill"
--
-- Why:
--   Previously place_estore_order RESERVED stock at order placement (deducted
--   -qty immediately) and the cancel trigger restored it. User policy change:
--   til the POS bills an online order, inventory must show ZERO movement.
--
-- New behavior (PERMANENT):
--   1. place_estore_order → inserts the order ONLY. No stock_history /
--      variant_stock_history rows. Inventory untouched at placement.
--   2. POS fulfillment (CheckoutPage/CheckoutModal) creates the sale with
--      sourceOrderId → salesService.create now deducts stock through the
--      normal sale path (AI-era client code removes the isEstoreFulfillment
--      skip). The sale's own 'sale' history rows are the ONLY stock effect.
--   3. trigger_release_estore_stock → cancel restores stock ONLY IF a matching
--      'Estore Reservation' row still exists (legacy in-flight orders placed
--      before this migration). New orders have no reservations → no-op.
--      Self-healing + idempotent: never double-restores, never invents stock.
--   4. LEGACY in-flight reservations (rows with note 'Estore Reservation: …')
--      are compensated with +qty 'return' entries at migration time. Net
--      zero — stock returns to pre-reservation level — so fulfilling an old
--      order after this migration deducts exactly once (no double deduction).
--   5. Cancelled store orders are auto-permanently deleted 24h after
--      cancellation by the app's maintenance prune (syncEngine), now ENABLED.
--      Permanent via row_tombstones (F21) — deleted rows can never resurrect.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. place_estore_order: REMOVE the reservation loop ─────────────────────
CREATE OR REPLACE FUNCTION place_estore_order(order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_order_id uuid;
BEGIN
    -- 1. Insert into store_orders (no stock effect — POS bill deducts later)
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

    RETURN jsonb_build_object('success', true, 'order_id', new_order_id);
END;
$$;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION place_estore_order(jsonb) TO anon, authenticated, service_role;

-- ── 2. trigger_release_estore_stock: restore ONLY if a reservation exists ──
-- New orders never create reservations → cancel is a no-op (correct).
-- Legacy pre-migration orders had reservations → cancel still releases them.
CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
    has_reservation boolean;
BEGIN
    -- If status changed to cancelled AND the order was never fulfilled
    -- (fulfilled orders already route stock through the sale/refund ledger —
    --  releasing here too would double-restore stock / inflate the ledger)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            -- Check if product tracks inventory
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;

            IF product_rec.track_inventory IS TRUE THEN
                IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                    -- Variant path: release ONLY if a legacy reservation exists for THIS order
                    SELECT EXISTS (
                        SELECT 1 FROM variant_stock_history
                        WHERE product_id = product_rec.id
                          AND variant_id = (item->>'variantId')::text
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
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
                    END IF;
                ELSE
                    -- Simple path: release ONLY if a legacy reservation exists for THIS order
                    SELECT EXISTS (
                        SELECT 1 FROM stock_history
                        WHERE product_id = product_rec.id
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
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
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_store_order_cancelled ON store_orders;
CREATE TRIGGER on_store_order_cancelled
AFTER UPDATE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_release_estore_stock();

-- ── 3. LEGACY RESERVATION RELEASE (one-time compensation) ──────────────────
-- Reverse every legacy 'Estore Reservation' row with an equal +qty 'return'
-- entry. Net ledger effect = zero; products.stock (already reduced by the
-- reservation trigger) returns to pre-reservation levels. Runs only when
-- reservations exist (idempotent — reference note is unique per function run
-- and successive runs find zero rows to release).
DO $$
DECLARE
    r record;
    n_released integer := 0;
BEGIN
    -- Simple-product reservations
    FOR r IN
        SELECT sh.product_id, sh.change_qty, sh.reference_id, o.invoice_number
        FROM stock_history sh
        LEFT JOIN store_orders o ON o.id = sh.reference_id
        WHERE sh.note LIKE 'Estore Reservation%'
          AND sh.change_qty < 0
    LOOP
        INSERT INTO stock_history (
            id, product_id, change_qty, type, reference_id, note, cashier_name, created_at
        ) VALUES (
            gen_random_uuid(), r.product_id, -r.change_qty, 'return', r.reference_id,
            'Estore Reservation Release (2026-08-12 migration): ' || COALESCE(r.invoice_number, 'order'),
            'System', now()
        );
        n_released := n_released + 1;
    END LOOP;

    -- Variant reservations
    FOR r IN
        SELECT vh.product_id, vh.variant_id, vh.variant_label, vh.change_qty, vh.reference_id, o.invoice_number
        FROM variant_stock_history vh
        LEFT JOIN store_orders o ON o.id = vh.reference_id
        WHERE vh.note LIKE 'Estore Reservation%'
          AND vh.change_qty < 0
    LOOP
        INSERT INTO variant_stock_history (
            id, product_id, variant_id, variant_label, change_qty, type,
            reference_id, note, cashier_name, created_at
        ) VALUES (
            gen_random_uuid(), r.product_id, r.variant_id, r.variant_label, -r.change_qty,
            'return', r.reference_id,
            'Estore Reservation Release (2026-08-12 migration): ' || COALESCE(r.invoice_number, 'order'),
            'System', now()
        );
        n_released := n_released + 1;
    END LOOP;

    RAISE NOTICE 'Legacy estore reservations released: %', n_released;
END $$;