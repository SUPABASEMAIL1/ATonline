-- Migration: Remove Shift System and associated tables/columns
-- Created at: 2026-05-26

-- 1. Drop views and tables
DROP VIEW IF EXISTS shift_summary CASCADE;
DROP VIEW IF EXISTS sale_items_unrolled CASCADE;
DROP FUNCTION IF EXISTS audit_shift_cash(uuid) CASCADE;

DROP TABLE IF EXISTS shift_denominations CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;

-- 2. Drop columns from sales, expenses, and app_settings
ALTER TABLE sales DROP COLUMN IF EXISTS shift_id CASCADE;
ALTER TABLE sales DROP COLUMN IF EXISTS refund_shift_id CASCADE;
ALTER TABLE expenses DROP COLUMN IF EXISTS shift_id CASCADE;
ALTER TABLE app_settings DROP COLUMN IF EXISTS shift_system_enabled CASCADE;

-- 3. Recreate sale_items_unrolled view without shift_id
CREATE OR REPLACE VIEW sale_items_unrolled AS
SELECT 
    s.id AS sale_id,
    s.workspace_id,
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
