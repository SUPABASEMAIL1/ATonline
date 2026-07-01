-- =============================================================================
-- Migration: 20260510_backfill_batches_history_realtime.sql
-- Purpose: Fix all verification issues:
--   1. Backfill product_batches for products with stock but no batches
--   2. Insert missing 'initial' stock_history entries
--   3. Enable supabase_realtime publication for core tables
--   4. Assign shift_id to orphaned sales and expenses
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FIX #1: Backfill product_batches for products with stock > 0 but no batches
-- This ensures FIFO cost calculations work correctly for all products
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, workspace_id, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  GREATEST(p.stock, 0),        -- Use current stock as received qty (floor at 0)
  GREATEST(p.stock, 0),        -- qty_remaining = stock (floor at 0)
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

-- For negative stock products: create a batch with 0 qty (so schema is complete)
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, workspace_id, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  0,
  0,
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


-- ─────────────────────────────────────────────────────────────────────
-- FIX #2: Insert missing 'initial' stock_history entries
-- Formula: initial_qty = current_stock - SUM(existing history)
-- This ensures the audit trail adds up to current stock
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO stock_history (id, product_id, change_qty, balance_after, type, note, cashier_name, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  p.stock - COALESCE(sh_sum.total_change, 0),   -- The missing initial amount
  p.stock - COALESCE(sh_sum.total_change, 0),    -- balance_after = initial amount (first entry)
  'initial',
  'Backfill: Initial stock entry (pre-FIFO legacy)',
  'System',
  COALESCE(p.created_at, NOW()) - INTERVAL '1 second'  -- 1s before product creation
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(change_qty) as total_change
  FROM stock_history
  GROUP BY product_id
) sh_sum ON sh_sum.product_id = p.id
WHERE p.track_inventory = true
  AND ABS(p.stock - COALESCE(sh_sum.total_change, 0)) > 1;  -- Only where there's a significant gap


-- ─────────────────────────────────────────────────────────────────────
-- FIX #3: Enable supabase_realtime publication for core tables
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop and recreate to ensure clean state
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime SET TABLE
      sales, products, customers, shifts, expenses,
      product_batches, stock_history, categories, suppliers,
      app_settings, users, discounts, purchase_orders, purchase_records;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- FIX #4: Assign orphaned sales to nearest shift
-- Strategy: For each sale without shift_id, find the shift that was 
-- open at the time the sale was created, or the closest preceding shift.
-- ─────────────────────────────────────────────────────────────────────
UPDATE sales s
SET shift_id = (
  SELECT sh.id
  FROM shifts sh
  WHERE sh.start_time <= s.created_at
  ORDER BY sh.start_time DESC
  LIMIT 1
)
WHERE s.shift_id IS NULL
  AND s.status = 'completed'
  AND EXISTS (SELECT 1 FROM shifts);  -- Only if shifts exist at all


-- ─────────────────────────────────────────────────────────────────────
-- FIX #5: Assign orphaned expenses to nearest shift
-- ─────────────────────────────────────────────────────────────────────
UPDATE expenses e
SET shift_id = (
  SELECT sh.id
  FROM shifts sh
  WHERE sh.start_time <= e.created_at
  ORDER BY sh.start_time DESC
  LIMIT 1
)
WHERE e.shift_id IS NULL
  AND EXISTS (SELECT 1 FROM shifts);


-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after to confirm fixes)
-- ─────────────────────────────────────────────────────────────────────

-- Verify batch backfill worked
-- SELECT p.name, p.stock, COALESCE(SUM(pb.qty_remaining),0) as batch_total
-- FROM products p
-- LEFT JOIN product_batches pb ON pb.product_id = p.id
-- WHERE p.track_inventory = true
-- GROUP BY p.id, p.name, p.stock
-- HAVING ABS(p.stock - COALESCE(SUM(pb.qty_remaining),0)) > 1;
-- EXPECTED: 0 rows (except negative stock products which have batch qty_remaining=0)

-- Verify stock history backfill worked
-- SELECT p.name, p.stock, SUM(sh.change_qty) as history_sum
-- FROM products p
-- LEFT JOIN stock_history sh ON sh.product_id = p.id
-- WHERE p.track_inventory = true
-- GROUP BY p.id, p.name, p.stock
-- HAVING ABS(p.stock - SUM(sh.change_qty)) > 1;
-- EXPECTED: 0 rows

-- Verify no orphaned sales
-- SELECT COUNT(*) FROM sales WHERE shift_id IS NULL AND status = 'completed';
-- EXPECTED: 0

-- Verify no orphaned expenses
-- SELECT COUNT(*) FROM expenses WHERE shift_id IS NULL;
-- EXPECTED: 0

-- Verify realtime
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- EXPECTED: 14 tables listed
