-- Crown Crust Deal: 2 slot-based deals (Medium / Large)
-- Crown Crust Deal - Medium (1300), Crown Crust Deal - Large (1850)

BEGIN;

-- Delete existing Crown Crust + Seekh Kabab deals
DELETE FROM bundle_items WHERE bundle_id IN (
  SELECT id FROM bundles WHERE name ILIKE '%crown%' OR name ILIKE '%seekh%'
);
DELETE FROM bundles WHERE name ILIKE '%crown%' OR name ILIKE '%seekh%';

-- Create 2 slot-based Crown Crust deals
WITH deal(name, dsc) AS (
  VALUES
    ('Crown Crust Deal - Medium', 'Crown crust pizza (10")'),
    ('Crown Crust Deal - Large',  'Crown crust pizza (13")')
),
ins_bundle AS (
  INSERT INTO bundles (id, name, description, discount_value, discount_type, active, is_combo, deal_category, estore_sort_order, highlight_tag, created_at, updated_at)
  SELECT gen_random_uuid(), d.name, d.dsc, 0, 'fixed', true, true, 'pizza', 0, 'crown', NOW(), NOW()
  FROM deal d
  RETURNING id, name
),
ins_slot AS (
  INSERT INTO bundle_slots (bundle_id, name, required_quantity, order_index)
  SELECT ib.id, 'Choose Your Crown Crust Pizza', 1, 0
  FROM ins_bundle ib
  RETURNING id, bundle_id
)
INSERT INTO bundle_slot_options (slot_id, product_id, sort_order)
SELECT ins_slot.id, '337d6efb-65d0-40fe-8eca-54598707be66'::uuid, 0
FROM ins_slot;

COMMIT;
