-- Add deal_category column to bundles table
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS deal_category TEXT NOT NULL DEFAULT 'pizza';

-- Backfill existing bundles
UPDATE bundles SET deal_category = 'pizza' WHERE name LIKE 'Sunday Offer%';
UPDATE bundles SET deal_category = 'pizza' WHERE name = 'Crown Crust Deal';
