-- C3: persist bundle extra toppings (combo add-ons) to the cloud so they survive sync.
-- The app already writes extraToppings locally + omits it from the remote payload;
-- this column makes the cloud schema match the code (fixes data-sync gap).
ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS extra_toppings JSONB DEFAULT '[]'::jsonb;
