-- 1. Revert Crown Crust Deal to fixed bundle with Crown Crust Pizza only
-- 2. Create new separate deal for Seekh Kabab Pizza

BEGIN;

-- === 1. Fix Crown Crust Deal ===
DELETE FROM bundle_slot_options WHERE slot_id = 'cb0a97d4-ebd5-4b2e-88f6-c320d784e365';
DELETE FROM bundle_slots WHERE id = 'cb0a97d4-ebd5-4b2e-88f6-c320d784e365';
INSERT INTO bundle_items (bundle_id, product_id, quantity)
VALUES ('f185e5bc-9683-47d8-9965-36e0c0e999cb', '337d6efb-65d0-40fe-8eca-54598707be66', 1);
UPDATE bundles
SET is_combo = false,
    updated_at = NOW()
WHERE id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';

-- === 2. Create Seekh Kabab Deal ===
WITH new_bundle AS (
  INSERT INTO bundles (id, name, description, discount_value, discount_type, active, is_combo, deal_category, estore_sort_order, highlight_tag, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'Seekh Kabab Deal',
    'Premium seekh kabab pizza with crown crust',
    0,
    'fixed',
    true,
    false,
    'pizza',
    0,
    'crown',
    NOW(),
    NOW()
  )
  RETURNING id
)
INSERT INTO bundle_items (bundle_id, product_id, quantity)
SELECT id, 'fbacb64d-87a4-41ec-a0dc-33bc82d3f57d'::uuid, 1
FROM new_bundle;

COMMIT;
