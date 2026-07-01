-- Add default_sale_type column to app_settings table
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS default_sale_type TEXT DEFAULT 'retail';
