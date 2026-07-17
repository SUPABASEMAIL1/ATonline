-- Split Crown Crust Deal + Seekh Kabab Deal into separate Medium/Large deals
-- Crown Crust Deal - Medium (1300)
-- Crown Crust Deal - Large (1850)
-- Seekh Kabab Deal - Medium (1350)
-- Seekh Kabab Deal - Large (1950)

BEGIN;

-- Delete old Seekh Kabab Deal bundle + items
DELETE FROM bundle_items WHERE bundle_id IN (SELECT id FROM bundles WHERE name = 'Seekh Kabab Deal');
DELETE FROM bundles WHERE name = 'Seekh Kabab Deal';

-- Delete old Crown Crust Deal bundle + items
DELETE FROM bundle_items WHERE bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';
DELETE FROM bundles WHERE id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';

-- Create 4 new fixed-price deals
WITH data(name, description, product_id, price) AS (
  VALUES
    ('Crown Crust Deal - Medium',  'Crown crust pizza (10")',             '337d6efb-65d0-40fe-8eca-54598707be66'::uuid, 1300),
    ('Crown Crust Deal - Large',   'Crown crust pizza (13")',             '337d6efb-65d0-40fe-8eca-54598707be66'::uuid, 1850),
    ('Seekh Kabab Deal - Medium',  'Seekh kabab crown crust pizza (10")', 'fbacb64d-87a4-41ec-a0dc-33bc82d3f57d'::uuid, 1350),
    ('Seekh Kabab Deal - Large',   'Seekh kabab crown crust pizza (13")', 'fbacb64d-87a4-41ec-a0dc-33bc82d3f57d'::uuid, 1950)
),
bundles_ins AS (
  INSERT INTO bundles (id, name, description, discount_value, discount_type, active, is_combo, deal_category, estore_sort_order, highlight_tag, override_price, created_at, updated_at)
  SELECT
    gen_random_uuid(), d.name, d.description, 0, 'fixed', true, false, 'pizza', 0, 'crown', d.price, NOW(), NOW()
  FROM data d
  RETURNING id, name
)
INSERT INTO bundle_items (bundle_id, product_id, quantity)
SELECT bi.id, d.product_id, 1
FROM bundles_ins bi
JOIN data d ON d.name = bi.name;

COMMIT;
