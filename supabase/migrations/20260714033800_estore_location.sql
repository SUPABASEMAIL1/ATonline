-- Migration: Phase 4 Estore Location & Maps config
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS estore_location_lat NUMERIC;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS estore_location_lng NUMERIC;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS estore_delivery_radius NUMERIC DEFAULT 5;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS estore_whatsapp_enabled BOOLEAN DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS estore_whatsapp_number TEXT;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_location_lat NUMERIC;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_location_lng NUMERIC;
