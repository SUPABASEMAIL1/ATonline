-- Add override_price to bundles for fixed-price deals (bypasses base - discount)
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS override_price NUMERIC(10,2);

-- Backfill Sunday Offer bundles with their correct fixed prices
UPDATE bundles SET override_price = 550 WHERE name = 'Sunday Offer - Small';
UPDATE bundles SET override_price = 750 WHERE name = 'Sunday Offer - Medium';
UPDATE bundles SET override_price = 1050 WHERE name = 'Sunday Offer - Large';
-- Crown Crust Deal: Medium combo price (1300+1350)
UPDATE bundles SET override_price = 2650 WHERE name = 'Crown Crust Deal';
