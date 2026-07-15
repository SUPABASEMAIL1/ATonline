-- Add estore_sort_order to categories table
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0;

-- Add estore_sort_order to bundles table
ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0;
