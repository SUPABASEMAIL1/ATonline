-- ============================================================
-- Migration: Fix LEGACY-BACKFILL-001 phantom batches and
-- reconcile stock/batch mismatches for all affected products
-- Date: 2026-07-24
-- ============================================================

BEGIN;

-- ============================================================
-- CATEGORY 1: Non-tracked products with phantom legacy batches
-- Delete the legacy batches entirely (these products don't use inventory tracking)
-- ============================================================

-- Mens T Shirt (track_inventory=false, stock=0, phantom batch=999956)
DELETE FROM product_batches 
WHERE id = '311e91eb-5f09-49df-afed-c7e357a240b2';

-- Mens Denim (track_inventory=false, stock=0, phantom batch=999496)
DELETE FROM product_batches 
WHERE id = '28d45792-2aa6-4bc2-ad73-3509d863564d';

-- ============================================================
-- CATEGORY 2: Tracked products with LEGACY-BACKFILL phantom batches
-- Set phantom batch qty_remaining so total batches = products.stock
-- ============================================================

-- Boxer: stock=60, real batches=56 (B-1780745622152) + 0 (B-1780745598256)
-- So legacy batch should be: 60 - 56 = 4
UPDATE product_batches 
SET qty_remaining = 4 
WHERE id = 'd0af2e35-cbb1-4b3a-afb6-ca3b1d3c1ecf';
-- Boxer: 56 + 0 + 4 = 60 ✅

-- Ladies Jeans: stock=999974, only 1 legacy batch at 999966
-- Set legacy batch = stock value (they're both inflated but at least they'll match)
UPDATE product_batches 
SET qty_remaining = 999974 
WHERE id = 'a0db8003-348a-45ac-b4e3-05e960bd533a';
-- Ladies Jeans: 999974 = 999974 ✅

-- ============================================================
-- CATEGORY 3: Tracked products where stock > batch_sum (orphan stock)
-- Create corrective batches to cover the gap
-- ============================================================

-- 501 selvedge: stock=33, batch=1, gap=32
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, supplier_name, created_at) 
VALUES (
  gen_random_uuid(),
  'bc19270c-0c97-4ddd-bf5a-16b225faec08',
  'RECONCILE-2026-07-24',
  32, 32, 
  (SELECT COALESCE(cost, 0) FROM products WHERE id = 'bc19270c-0c97-4ddd-bf5a-16b225faec08'),
  (SELECT COALESCE(price, 0) FROM products WHERE id = 'bc19270c-0c97-4ddd-bf5a-16b225faec08'),
  'SYSTEM-RECONCILIATION',
  NOW()
);

-- Kids Denim Jeans: stock=34, batch=22, gap=12
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, supplier_name, created_at) 
VALUES (
  gen_random_uuid(),
  'a1b2c3d4-0003-4fd5-8caa-b1c3764f0003',
  'RECONCILE-2026-07-24',
  12, 12, 
  (SELECT COALESCE(cost, 0) FROM products WHERE id = 'a1b2c3d4-0003-4fd5-8caa-b1c3764f0003'),
  (SELECT COALESCE(price, 0) FROM products WHERE id = 'a1b2c3d4-0003-4fd5-8caa-b1c3764f0003'),
  'SYSTEM-RECONCILIATION',
  NOW()
);

-- kids Trouser: stock=33, batch=25, gap=8
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, supplier_name, created_at) 
VALUES (
  gen_random_uuid(),
  'ed67b1cd-1558-4060-a8bb-5d3729f3bc94',
  'RECONCILE-2026-07-24',
  8, 8, 
  (SELECT COALESCE(cost, 0) FROM products WHERE id = 'ed67b1cd-1558-4060-a8bb-5d3729f3bc94'),
  (SELECT COALESCE(price, 0) FROM products WHERE id = 'ed67b1cd-1558-4060-a8bb-5d3729f3bc94'),
  'SYSTEM-RECONCILIATION',
  NOW()
);

-- Mens Cargo 6 Pocket: stock=21, batch=14, gap=7
-- Note: This product's only batch IS the legacy batch (at 14). Just update it to match stock.
UPDATE product_batches 
SET qty_remaining = 21 
WHERE id = 'fe8fee8c-865c-4164-ad32-52eaf80cdf63';

-- Kids T Shirt: stock=36, batch=29, gap=7
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, supplier_name, created_at) 
VALUES (
  gen_random_uuid(),
  'a1b2c3d4-0006-4fd5-8caa-b1c3764f0006',
  'RECONCILE-2026-07-24',
  7, 7, 
  (SELECT COALESCE(cost, 0) FROM products WHERE id = 'a1b2c3d4-0006-4fd5-8caa-b1c3764f0006'),
  (SELECT COALESCE(price, 0) FROM products WHERE id = 'a1b2c3d4-0006-4fd5-8caa-b1c3764f0006'),
  'SYSTEM-RECONCILIATION',
  NOW()
);

-- ============================================================
-- CATEGORY 4: Negative stock products
-- ============================================================

-- LV Trousers: stock=-9, batches all drained (0). Set stock to 0.
UPDATE products 
SET stock = 0, updated_at = NOW() 
WHERE id = '796ff4b7-686b-4557-889a-e5c070b95695';

-- ============================================================
-- LOG: Insert reconciliation entries into stock_history for audit trail
-- ============================================================

INSERT INTO stock_history (id, product_id, change_qty, balance_after, type, note, cashier_name, created_at) VALUES
(gen_random_uuid(), '9ebbcff9-81cb-4d08-a909-8139267ab2d4', 0, 0, 'adjustment', '[RECONCILE] Deleted phantom LEGACY-BACKFILL-001 batch (999956 phantom qty). Product is untracked.', 'System', NOW()),
(gen_random_uuid(), '955a353b-ea54-4777-b433-763ad2b2a21f', 0, 0, 'adjustment', '[RECONCILE] Deleted phantom LEGACY-BACKFILL-001 batch (999496 phantom qty). Product is untracked.', 'System', NOW()),
(gen_random_uuid(), '59389d2d-026a-4b03-b966-4190fcea0ac1', 0, 60, 'adjustment', '[RECONCILE] Fixed LEGACY-BACKFILL-001 batch: 999937 to 4. Total batches now match stock (60).', 'System', NOW()),
(gen_random_uuid(), '2d912bf1-b0dc-45df-9f7c-57fced543094', 0, 999974, 'adjustment', '[RECONCILE] Fixed LEGACY-BACKFILL-001 batch: 999966 to 999974. Batch now matches stock.', 'System', NOW()),
(gen_random_uuid(), 'bc19270c-0c97-4ddd-bf5a-16b225faec08', 0, 33, 'adjustment', '[RECONCILE] Created corrective batch (32 units) to cover orphan stock gap.', 'System', NOW()),
(gen_random_uuid(), 'a1b2c3d4-0003-4fd5-8caa-b1c3764f0003', 0, 34, 'adjustment', '[RECONCILE] Created corrective batch (12 units) to cover orphan stock gap.', 'System', NOW()),
(gen_random_uuid(), 'ed67b1cd-1558-4060-a8bb-5d3729f3bc94', 0, 33, 'adjustment', '[RECONCILE] Created corrective batch (8 units) to cover orphan stock gap.', 'System', NOW()),
(gen_random_uuid(), 'a1b2c3d4-0009-4fd5-8caa-b1c3764f0009', 0, 21, 'adjustment', '[RECONCILE] Updated LEGACY-BACKFILL-001 batch: 14 to 21 to match stock.', 'System', NOW()),
(gen_random_uuid(), 'a1b2c3d4-0006-4fd5-8caa-b1c3764f0006', 0, 36, 'adjustment', '[RECONCILE] Created corrective batch (7 units) to cover orphan stock gap.', 'System', NOW()),
(gen_random_uuid(), '796ff4b7-686b-4557-889a-e5c070b95695', 9, 0, 'adjustment', '[RECONCILE] Reset negative stock from -9 to 0. Product was oversold.', 'System', NOW());

COMMIT;
