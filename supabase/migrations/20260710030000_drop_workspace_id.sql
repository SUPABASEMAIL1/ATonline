-- ════════════════════════════════════════════════════════════════
-- Migration: drop_workspace_id
-- Date: 2026-07-10
-- Description: Drop workspace_id from all tables. Single-tenant
--   architecture (1 Clone = 1 Shop) makes workspace_id obsolete.
--   Also removes unique index on bundles(workspace_id, name),
--   updates functions/views that reference workspace_id, and
--   updates seed data.
-- ════════════════════════════════════════════════════════════════

-- ═══ 1. DROP DEPENDENT VIEWS ═══
DROP VIEW IF EXISTS sale_items_unrolled;

-- ═══ 2. DROP UNIQUE INDEX on bundles that uses workspace_id ═══
DROP INDEX IF EXISTS idx_bundles_name_workspace;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundles_name_unique ON bundles (LOWER(TRIM(name)));

-- ═══ 3. DROP workspace_id COLUMNS (17 tables) ═══
ALTER TABLE app_settings            DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE categories              DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE customers               DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE suppliers               DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE products                DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE product_batches         DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE discounts               DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE users                   DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE sales                   DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE expenses                DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE sales_tabs              DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE purchase_records        DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE purchase_orders         DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE purchase_order_items    DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE supplier_transactions   DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE payments                DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE stock_history           DROP COLUMN IF EXISTS workspace_id;

-- bundles: NOT NULL constraint — still drops
ALTER TABLE bundles DROP COLUMN IF EXISTS workspace_id;

-- ═══ 3. UPDATE get_my_workspace_id() — return auth.uid() as fallback ═══
CREATE OR REPLACE FUNCTION get_my_workspace_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 4. UPDATE handle_new_user() — stop setting workspace_id ═══
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    is_first_user BOOLEAN;
    _role TEXT;
    base_username TEXT;
    final_username TEXT;
    suffix INT := 0;
BEGIN
    SELECT NOT EXISTS (SELECT 1 FROM public.users) INTO is_first_user;

    IF is_first_user THEN
        _role := 'admin';
    ELSE
        _role := COALESCE(NEW.raw_user_meta_data->>'role', 'cashier');
    END IF;

    base_username := COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1));
    final_username := base_username;

    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = final_username) LOOP
        suffix := suffix + 1;
        final_username := base_username || suffix::TEXT;
    END LOOP;

    INSERT INTO public.users (
        id, username, name, email, role, active
    )
    VALUES (
        NEW.id,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.email,
        _role,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. UPDATE process_sale RPC — remove workspace_id from INSERT ═══
CREATE OR REPLACE FUNCTION process_sale(sale_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_sale_id UUID;
BEGIN
    INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
        tax_amount, total, received_amount, change_amount, payment_method,
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at
    ) VALUES (
        (sale_data->>'id')::UUID,
        sale_data->>'invoice_number', (sale_data->>'customer_id')::UUID,
        sale_data->>'customer_name', sale_data->>'customer_phone',
        (sale_data->'items')::JSONB, (sale_data->>'subtotal')::DECIMAL,
        (sale_data->>'discount_amount')::DECIMAL, (sale_data->>'bill_discount_value')::DECIMAL,
        sale_data->>'bill_discount_type', (sale_data->>'tax_amount')::DECIMAL,
        (sale_data->>'total')::DECIMAL, (sale_data->>'received_amount')::DECIMAL,
        (sale_data->>'change_amount')::DECIMAL, sale_data->>'payment_method',
        COALESCE(sale_data->>'status', 'completed'), sale_data->>'cashier',
        sale_data->>'cashier_role', sale_data->>'notes',
        COALESCE(sale_data->>'sale_type', 'retail'),
        COALESCE((sale_data->>'timestamp')::TIMESTAMPTZ, NOW()), NOW(), NOW()
    ) RETURNING id INTO new_sale_id;
    RETURN jsonb_build_object('success', true, 'id', new_sale_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;

-- ═══ 6. UPDATE sale_items_unrolled view — remove workspace_id ═══
CREATE OR REPLACE VIEW sale_items_unrolled AS
SELECT
    s.id AS sale_id,
    s.sale_date,
    (item->'product')->>'name' AS product_name,
    (item->'product')->>'sku' AS sku,
    (item->>'quantity')::numeric AS quantity,
    (item->>'subtotal')::numeric AS subtotal,
    COALESCE((item->>'purchaseCost')::numeric, 0) AS purchase_cost,
    (item->>'subtotal')::numeric - COALESCE((item->>'purchaseCost')::numeric, 0) AS profit
FROM sales s,
jsonb_array_elements(s.items) AS item
WHERE s.status = 'completed';

-- ═══ 7. UPDATE seed data — remove workspace_id from INSERT ═══
-- Default app_settings row
INSERT INTO app_settings (id, store_name)
VALUES ('00000000-0000-4000-8000-000000000001', 'ZaynahsPOS')
ON CONFLICT (id) DO NOTHING;

-- ═══ 8. UPDATE data integrity backfill — remove workspace_id refs ═══
-- Replace the backfill queries that referenced p.workspace_id
-- (Backfill for tracked products with stock but no batches)
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  GREATEST(p.stock, 0),
  GREATEST(p.stock, 0),
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock > 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.created_at
HAVING COUNT(pb.id) = 0;

-- Backfill for negative stock products
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  0, 0,
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock < 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.created_at
HAVING COUNT(pb.id) = 0;
