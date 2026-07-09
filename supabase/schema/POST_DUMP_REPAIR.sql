-- ================================================================
-- ZAYNAH'S POS v2 — POST DUMP REPAIR SCRIPT
-- ================================================================
-- Run this AFTER restoring a Supabase dump (pg_dump / pg_restore)
-- to fix any missing columns, indexes, functions, realtime config,
-- and data integrity that may not survive a restore.
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS.
-- ================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. ENSURE ALL COLUMNS EXIST (ALTER TABLE ADD IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────

-- Sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS split_payments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS extra_charges JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'retail';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_date DATE DEFAULT CURRENT_DATE;

-- App Settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS allow_credit_over_limit BOOLEAN DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS enable_split_payment BOOLEAN DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS enable_extra_charges BOOLEAN DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_grid_columns INTEGER DEFAULT 4;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_name_lines INTEGER DEFAULT 1;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_font_size INTEGER DEFAULT 9;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_content_scale NUMERIC DEFAULT 1.0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_margin_x INTEGER DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_margin_y INTEGER DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_gap_x INTEGER DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_gap_y INTEGER DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS barcode_bar_width NUMERIC DEFAULT 1.2;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS default_sale_type TEXT DEFAULT 'retail';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS touch_keyboard_enabled BOOLEAN DEFAULT false;

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_sale BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_records BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_po BOOLEAN DEFAULT false;

-- Expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS store_type TEXT DEFAULT 'retail';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_by TEXT;

-- Bundles
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS hide_item_prices BOOLEAN NOT NULL DEFAULT FALSE;


-- ─────────────────────────────────────────────────────────────────
-- 2. ENSURE CRITICAL INDEXES EXIST
-- ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products (LOWER(TRIM(name)));
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_value TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_value ON products(barcode_value) WHERE barcode_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);


-- ─────────────────────────────────────────────────────────────────
-- 3. ENSURE FUNCTIONS EXIST
-- ─────────────────────────────────────────────────────────────────

-- get_my_workspace_id (required for RLS if re-enabled)
CREATE OR REPLACE FUNCTION get_my_workspace_id()
RETURNS UUID AS $$
  SELECT workspace_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- update_updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit stock integrity function
CREATE OR REPLACE FUNCTION audit_stock_integrity()
RETURNS TABLE (
  product_name TEXT,
  product_stock INTEGER,
  batch_sum BIGINT,
  difference BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.name,
    p.stock,
    COALESCE(SUM(pb.qty_remaining), 0)::BIGINT,
    (p.stock - COALESCE(SUM(pb.qty_remaining), 0))::BIGINT
  FROM products p
  LEFT JOIN product_batches pb ON pb.product_id = p.id
  WHERE p.track_inventory = true
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0);
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────
-- 4. DISABLE RLS ON ALL PUBLIC TABLES (Service Role access)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Remove all existing policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- 5. REALTIME PUBLICATION (Idempotent)
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime SET TABLE
      app_settings,
      bundles,
      bundle_items,
      bundle_slots,
      bundle_slot_options,
      categories,
      customers,
      discounts,
      expenses,
      payments,
      product_batches,
      products,
      purchase_order_items,
      purchase_orders,
      purchase_records,
      sales,
      sales_tabs,
      stock_history,
      supplier_transactions,
      suppliers,
      users;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- 6. DATA INTEGRITY — Backfill missing batches and stock_history
-- ─────────────────────────────────────────────────────────────────

-- Backfill product_batches for tracked products with stock but no batches
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, workspace_id, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  GREATEST(p.stock, 0),
  GREATEST(p.stock, 0),
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  p.workspace_id,
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock > 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.workspace_id, p.created_at
HAVING COUNT(pb.id) = 0;

-- Backfill for negative stock products (0 qty batch for completeness)
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, workspace_id, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  0, 0,
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  p.workspace_id,
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock < 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.workspace_id, p.created_at
HAVING COUNT(pb.id) = 0;

-- Backfill missing 'initial' stock_history entries
INSERT INTO stock_history (id, product_id, change_qty, balance_after, type, note, cashier_name, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  p.stock - COALESCE(sh_sum.total_change, 0),
  p.stock - COALESCE(sh_sum.total_change, 0),
  'initial',
  'Backfill: Initial stock entry (post-dump repair)',
  'System',
  COALESCE(p.created_at, NOW()) - INTERVAL '1 second'
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(change_qty) as total_change
  FROM stock_history
  GROUP BY product_id
) sh_sum ON sh_sum.product_id = p.id
WHERE p.track_inventory = true
  AND ABS(p.stock - COALESCE(sh_sum.total_change, 0)) > 1;




-- ─────────────────────────────────────────────────────────────────
-- 7. REPLICA IDENTITY (Required for Realtime)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', tbl);
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- DONE — Run verification queries to confirm everything is clean:
--
-- SELECT * FROM audit_stock_integrity();  -- Should return 0 rows (or only negative stock products)
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';  -- Should list 14+ tables
-- ═══════════════════════════════════════════════════════════════
