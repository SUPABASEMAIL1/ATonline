-- ================================================================
-- [2026-07-18] Variable Products (Parent/Child Architecture)
-- ================================================================
-- Adds parent_id and product_type to the products table to support
-- true variations with independent stock, cost, and sales tracking.
-- ================================================================

-- 1. Add product_type to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'simple' 
CHECK (product_type IN ('simple', 'variable', 'variation'));

-- 2. Add parent_id to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- 3. Create an index for parent_id to speed up fetching variations
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_id);

-- 4. Automatically index product_type
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
