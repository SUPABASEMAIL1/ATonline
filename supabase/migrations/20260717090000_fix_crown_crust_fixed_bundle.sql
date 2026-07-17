-- Convert Crown Crust Deal back to Fixed Bundle
-- Delete slot-based config
DELETE FROM bundle_slot_options WHERE slot_id = (
  SELECT id FROM bundle_slots WHERE bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb'
);
DELETE FROM bundle_slots WHERE bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';

-- Add bundle items for Crown Crust + Seekh Kabab as Fixed Bundle
INSERT INTO bundle_items (id, bundle_id, product_id, quantity, created_at)
VALUES
  (gen_random_uuid(), 'f185e5bc-9683-47d8-9965-36e0c0e999cb', '337d6efb-65d0-40fe-8eca-54598707be66', 1, NOW()),
  (gen_random_uuid(), 'f185e5bc-9683-47d8-9965-36e0c0e999cb', 'fbacb64d-87a4-41ec-a0dc-33bc82d3f57d', 1, NOW());

-- Set as Fixed Bundle with 0 discount (pay product prices)
UPDATE bundles SET is_combo = false, discount_value = 0, discount_type = 'fixed'
WHERE id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';
