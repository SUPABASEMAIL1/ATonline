-- Add menu_number and highlight_tag to products and bundles
-- for physical menu ordering and Sunday Deal / Crown Crust badges.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS menu_number INTEGER,
  ADD COLUMN IF NOT EXISTS highlight_tag TEXT CHECK (highlight_tag IN ('sunday', 'crown'));

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS highlight_tag TEXT CHECK (highlight_tag IN ('sunday', 'crown'));
