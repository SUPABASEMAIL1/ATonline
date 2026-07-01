-- Migration: Universal POS Fields (Modifiers, Variants, Service, Serial)
-- Description: Extends the products table to support fashion, food, and hardware verticals.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS require_serial BOOLEAN DEFAULT false;
