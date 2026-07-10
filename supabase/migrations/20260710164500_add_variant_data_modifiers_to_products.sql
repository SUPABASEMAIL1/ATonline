-- [2026-07-10] Add variant_data and modifiers JSONB columns to products
-- These were defined in SUPER_MASTER_SCHEMA.sql but were absent from the live DB,
-- causing 400 Bad Request errors every time a product sync was attempted.
-- Using ADD COLUMN IF NOT EXISTS for idempotency.

ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_data JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers    JSONB DEFAULT '[]'::jsonb;
