-- Add estore sort columns to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estore_category_sort_order INTEGER DEFAULT 0;
