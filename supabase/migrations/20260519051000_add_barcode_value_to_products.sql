-- [2026-05-19] Add barcode_value column to products table for Code 128 barcode system
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_value TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_value ON products(barcode_value) WHERE barcode_value IS NOT NULL;
