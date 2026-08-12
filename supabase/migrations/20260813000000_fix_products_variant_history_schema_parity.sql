-- 20260813000000_fix_products_variant_history_schema_parity.sql
-- 🐛 FIX (found by TESTS_GUIDE full-system-flow battery, 2026-08-12):
--   1. MINIMAHAL: products.product_type (etc.) columns were NEVER added — the
--      master schema's post-launch ALTER block omitted them → variable products
--      could not save on that project (schema divergence, MAJOR RULES #5/#6).
--   2. PIZZAMILANO: variant_stock_history type CHECK lacked 'purchase' → variant
--      stock-in crashed there (divergence). Master schema now normalizes to the
--      full signed-7 type set.
-- Fix = idempotent ALTERs; safe on all 4 projects.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type   TEXT DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS is_service     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_serial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS unit           TEXT DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS parent_id      UUID REFERENCES products(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE variant_stock_history DROP CONSTRAINT IF EXISTS variant_stock_history_type_check;
  ALTER TABLE variant_stock_history ADD CONSTRAINT variant_stock_history_type_check
    CHECK (type IN ('sale', 'return', 'adjustment', 'initial', 'purchase', 'stock_in', 'adjustment_out'));
EXCEPTION WHEN undefined_object THEN NULL; END $$;