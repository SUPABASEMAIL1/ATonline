-- 3 Pizza Deal - Clone of Sunday Offer structure
-- 3 sizes: Small (600), Medium (950), Large (1350)
-- Pick 1 flavor from all 13 pizza options
-- Image: 3-pizza-deal.jpg
-- Created: 2026-07-17

-- Small
INSERT INTO bundles (id, name, description, override_price, discount_value, discount_type, is_combo, hide_item_prices, schedule_type, deal_category, image, active, created_at, updated_at)
VALUES (gen_random_uuid(), '3 Pizza Deal - Small', 'Pick any flavor of your choice - Small 7" pizza', 600, 0, 'fixed', true, true, 'always', 'pizza', 'https://dkmvcprbssnyxnlolgcd.supabase.co/storage/v1/object/public/menu-images/product-images/3-pizza-deal.jpg', true, '2026-07-17T12:00:00Z', '2026-07-17T12:00:00Z');

-- Medium
INSERT INTO bundles (id, name, description, override_price, discount_value, discount_type, is_combo, hide_item_prices, schedule_type, deal_category, image, active, created_at, updated_at)
VALUES (gen_random_uuid(), '3 Pizza Deal - Medium', 'Pick any flavor of your choice - Medium 10" pizza', 950, 0, 'fixed', true, true, 'always', 'pizza', 'https://dkmvcprbssnyxnlolgcd.supabase.co/storage/v1/object/public/menu-images/product-images/3-pizza-deal.jpg', true, '2026-07-17T12:00:00Z', '2026-07-17T12:00:00Z');

-- Large
INSERT INTO bundles (id, name, description, override_price, discount_value, discount_type, is_combo, hide_item_prices, schedule_type, deal_category, image, active, created_at, updated_at)
VALUES (gen_random_uuid(), '3 Pizza Deal - Large', 'Pick any flavor of your choice - Large 13" pizza', 1350, 0, 'fixed', true, true, 'always', 'pizza', 'https://dkmvcprbssnyxnlolgcd.supabase.co/storage/v1/object/public/menu-images/product-images/3-pizza-deal.jpg', true, '2026-07-17T12:00:00Z', '2026-07-17T12:00:00Z');

-- Create slots
INSERT INTO bundle_slots (id, bundle_id, name, required_quantity, order_index, created_at)
SELECT gen_random_uuid(), id, 'Choose Your Flavor (Pick 1)', 1, 0, '2026-07-17T12:00:00Z'
FROM bundles WHERE name LIKE '3 Pizza Deal%';

-- Copy all 13 pizza options from Sunday Offer Small slot to each 3 Pizza Deal slot
INSERT INTO bundle_slot_options (id, slot_id, product_id, sort_order, created_at)
SELECT gen_random_uuid(), bs.id, so.product_id, so.sort_order, '2026-07-17T12:00:00Z'
FROM bundle_slots bs
CROSS JOIN LATERAL (
  SELECT product_id, sort_order FROM bundle_slot_options
  WHERE slot_id = (SELECT id FROM bundle_slots WHERE bundle_id = (SELECT id FROM bundles WHERE name = 'Sunday Offer - Small'))
) so
WHERE bs.bundle_id IN (SELECT id FROM bundles WHERE name LIKE '3 Pizza Deal%');
