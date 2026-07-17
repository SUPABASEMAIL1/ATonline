-- Fix Burger Meal Deal slot/category mismatch + create burger products
-- Also fix deal pricing and remove duplicate

-- 1. Create burger products
INSERT INTO products (id, name, sku, category, price, image, active, created_at)
VALUES
  (gen_random_uuid(), 'Beef Burger', 'BEEF-BURGER', 'Burgers', 450.00,
   'https://dkmvcprbssnyxnlolgcd.supabase.co/storage/v1/object/public/menu-images/product-images/beef-burger.jpg',
   true, NOW()),
  (gen_random_uuid(), 'Chicken Burger', 'CHICKEN-BURGER', 'Burgers', 450.00,
   'https://dkmvcprbssnyxnlolgcd.supabase.co/storage/v1/object/public/menu-images/product-images/beef-burger.jpg',
   true, NOW())
ON CONFLICT DO NOTHING;

-- 2. Fix Burger Meal Deal (original) — Main Course → Burgers, Beverage → Drinks
-- Delete old slot options for original Burger Meal Deal (bundle_id = c2cbec04)
DELETE FROM bundle_slot_options WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id = 'c2cbec04-b005-481d-946b-b57d0279dca4'
);

-- Insert burgers into Main Course slot (slot_id = a9188fed)
INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), 'a9188fed-8d2b-44a1-9322-bdd061b67fc4', p.id, row_number() OVER (), NOW()
FROM products p
WHERE p.name IN ('Beef Burger', 'Chicken Burger');

-- Insert drinks into Beverage slot (slot_id = 8f3f0b69)
INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), '8f3f0b69-a87b-4f41-9608-9308eaddb4ea', p.id, row_number() OVER (), NOW()
FROM products p
WHERE p.name IN ('500 ml Drink', '1 Liter Drink', '1.5 Liter Drink');

-- 3. Fix Burger Meal Deal (2) — same fixes
DELETE FROM bundle_slot_options WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id = '2436f3b8-e77d-497e-8791-8f6669146221'
);

INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), '8a00df5c-c351-4fc4-8608-7be426759693', p.id, row_number() OVER (), NOW()
FROM products p
WHERE p.name IN ('Beef Burger', 'Chicken Burger');

INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), '947637f9-b606-4376-9c09-dbd65003c264', p.id, row_number() OVER (), NOW()
FROM products p
WHERE p.name IN ('500 ml Drink', '1 Liter Drink', '1.5 Liter Drink');

-- 4. Delete duplicate "Burger Meal Deal (2)"
DELETE FROM bundle_slot_options WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id = '2436f3b8-e77d-497e-8791-8f6669146221'
);
DELETE FROM bundle_slots WHERE bundle_id = '2436f3b8-e77d-497e-8791-8f6669146221';
DELETE FROM bundle_items WHERE bundle_id = '2436f3b8-e77d-497e-8791-8f6669146221';
DELETE FROM bundles WHERE id = '2436f3b8-e77d-497e-8791-8f6669146221';

-- 5. Crown Crust Deal: ensure it's Fixed Bundle (is_combo=false) with correct items
-- Already is_combo=false. Items already set. Just ensure pricing.
-- Crown Crust Pizza (10"=1300, 13"=1850) and Seekh Kabab Pizza (10"=1350, 13"=1950)
-- are already linked as bundle_items. No change needed.

-- 6. Sunday Deals: keep as Slot-Based (need flavor selection)
-- Small: Rs600 - Rs50 discount = Rs550 ✓ (current discount_value=50 is correct)
-- Medium: The product base is Rs600 but we want final=Rs750 for 10" variant
--   → Need to change: the deal should use variant price + adjusted discount
--   → Best approach: set discount_value so that Rs950 (10" variant) - X = Rs750
--   → discount = Rs200 → discount_value = 200 ✓ (already correct!)
-- Large: Rs1350 (13" variant) - Rs300 = Rs1050 ✓ (already correct!)
-- The discounts are actually correct IF the variant pricing is used.
-- No SQL changes needed for Sunday Deals.

-- 7. 3 Pizza Deals: verify they have all real pizza products
-- Already verified: all slots contain all 21 real pizza products.
-- Discounts: Small=10%, Medium=15%, Large=20% — correct.

-- 8. Burger Meal Deal pricing stays at Rs300 discount as specified by user.
-- Original buggy total was Rs870 (drink Rs220 + pizza Rs650 swapped slots).
-- Now with correct items, totals will be burger ~Rs450 + drink ~Rs120-220 = ~Rs570-670,
-- minus Rs300 discount = final ~Rs270-370 per combo.
