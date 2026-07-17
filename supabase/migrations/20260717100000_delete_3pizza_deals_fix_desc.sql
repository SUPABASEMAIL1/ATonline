-- 1. Delete 3 Pizza Deals (not on Pizza Milano menu)
DELETE FROM bundle_slot_toppings WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id IN (
    '8683221b-05a4-4a26-953f-ae979d54b719',
    '957f32ac-c29d-4eea-83c1-100193112452',
    '114b031a-f069-4f58-b631-2a4c85e364f5'
  )
);
DELETE FROM bundle_slot_options WHERE slot_id IN (
  SELECT id FROM bundle_slots WHERE bundle_id IN (
    '8683221b-05a4-4a26-953f-ae979d54b719',
    '957f32ac-c29d-4eea-83c1-100193112452',
    '114b031a-f069-4f58-b631-2a4c85e364f5'
  )
);
DELETE FROM bundle_slots WHERE bundle_id IN (
  '8683221b-05a4-4a26-953f-ae979d54b719',
  '957f32ac-c29d-4eea-83c1-100193112452',
  '114b031a-f069-4f58-b631-2a4c85e364f5'
);
DELETE FROM bundle_items WHERE bundle_id IN (
  '8683221b-05a4-4a26-953f-ae979d54b719',
  '957f32ac-c29d-4eea-83c1-100193112452',
  '114b031a-f069-4f58-b631-2a4c85e364f5'
);
DELETE FROM bundles WHERE id IN (
  '8683221b-05a4-4a26-953f-ae979d54b719',
  '957f32ac-c29d-4eea-83c1-100193112452',
  '114b031a-f069-4f58-b631-2a4c85e364f5'
);

-- 2. Fix description: Bar.B.Q Chicken — "Chicken BBQ" as per menu
UPDATE products SET description = 'Pizza Sauce, Cheese, Chicken BBQ, Green Pepper, Onion, Green Chilli'
WHERE name = 'Bar.B.Q Chicken Pizza';
