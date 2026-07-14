-- Migration: Add E-store configuration fields to settings table
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS estore_theme_color TEXT DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS estore_delivery_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS estore_min_order NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS estore_cod_enabled BOOLEAN DEFAULT true;
