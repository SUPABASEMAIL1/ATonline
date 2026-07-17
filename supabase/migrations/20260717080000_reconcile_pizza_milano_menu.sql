-- Reconcile database against real Pizza Milano menu
-- 1. Delete burger products + Burger Meal Deal (not on Pizza Milano menu)
-- 2. Fix naming: "Chicken Malai Boti pizza" -> "Chicken Malai Boti Pizza"
-- 3. Convert Crown Crust Deal to Slot-Based (pick-one deal, not fixed bundle)

-- 1a. Delete Burger Meal Deal bundle (c2cbec04)
DELETE FROM bundle_slot_options WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id = 'c2cbec04-b005-481d-946b-b57d0279dca4'
);
DELETE FROM bundle_slots WHERE bundle_id = 'c2cbec04-b005-481d-946b-b57d0279dca4';
DELETE FROM bundle_items WHERE bundle_id = 'c2cbec04-b005-481d-946b-b57d0279dca4';
DELETE FROM bundles WHERE id = 'c2cbec04-b005-481d-946b-b57d0279dca4';

-- 1b. Delete burger products (Beef Burger + Chicken Burger)
DELETE FROM product_toppings WHERE product_id IN (
  SELECT id FROM products WHERE category = 'Burgers'
);
DELETE FROM products WHERE category = 'Burgers';

-- 2. Fix naming: "Chicken Malai Boti pizza" -> "Chicken Malai Boti Pizza"
UPDATE products SET name = 'Chicken Malai Boti Pizza' WHERE name = 'Chicken Malai Boti pizza';

-- 3. Convert Crown Crust Deal from Fixed Bundle to Slot-Based
-- Delete existing bundle_items
DELETE FROM bundle_items WHERE bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';

-- Create a single slot for Crown Crust Deal
INSERT INTO bundle_slots (id, bundle_id, name, required_quantity, order_index, created_at)
VALUES (gen_random_uuid(), 'f185e5bc-9683-47d8-9965-36e0c0e999cb', 'Choose Your Premium Pizza (Pick 1)', 1, 0, NOW());

-- Add Crown Crust + Seekh Kabab as slot options
INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), bs.id, p.id, 0, NOW()
FROM bundle_slots bs, products p
WHERE bs.bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb'
  AND p.name = 'Crown Crust Pizza';

INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), bs.id, p.id, 1, NOW()
FROM bundle_slots bs, products p
WHERE bs.bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb'
  AND p.name = 'Seekh Kabab Pizza';

-- Set Crown Crust to Slot-Based (is_combo=true) with 0 discount (pay product price)
UPDATE bundles SET is_combo = true, discount_value = 0, discount_type = 'fixed' WHERE id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';
