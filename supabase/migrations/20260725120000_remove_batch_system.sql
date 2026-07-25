-- Migration: Remove Batch System Completely
-- Date: 2026-07-25
-- Description: Drops product_batches table, products.batches column, and related functions.

-- 1. Drop the table and all its constraints/indexes (CASCADE handles foreign keys and views)
DROP TABLE IF EXISTS product_batches CASCADE;

-- 2. Drop the batches JSONB column from products
ALTER TABLE products DROP COLUMN IF EXISTS batches;

-- 3. Drop functions that depended on batches
DROP FUNCTION IF EXISTS audit_stock_integrity();
DROP FUNCTION IF EXISTS reconcile_stock_with_batches(boolean);

-- Note: The triggers (e.g. update_product_batches_updated_at) were automatically dropped when the table was dropped.
-- The publication (supabase_realtime) will silently ignore the missing table.
