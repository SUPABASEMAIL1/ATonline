-- Crown Crust Deal: Convert fixed bundle → slot-based (OR choice)
-- Menu says "Choose your premium crown crust OR seekh kabab pizza"
BEGIN;

WITH deleted AS (
  DELETE FROM bundle_items WHERE bundle_id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb'
  RETURNING bundle_id
),
slot_insert AS (
  INSERT INTO bundle_slots (bundle_id, name, required_quantity, order_index)
  VALUES ('f185e5bc-9683-47d8-9965-36e0c0e999cb', 'Choose Your Pizza (Pick 1)', 1, 0)
  RETURNING id
)
INSERT INTO bundle_slot_options (slot_id, product_id, sort_order)
SELECT slot_insert.id, unnest(ARRAY['337d6efb-65d0-40fe-8eca-54598707be66'::uuid, 'fbacb64d-87a4-41ec-a0dc-33bc82d3f57d'::uuid]),
  unnest(ARRAY[0, 1])
FROM slot_insert;

UPDATE bundles SET is_combo = true WHERE id = 'f185e5bc-9683-47d8-9965-36e0c0e999cb';

COMMIT;
