-- Add estore_pickup_enabled and estore_delivery_enabled to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS estore_pickup_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS estore_delivery_enabled BOOLEAN DEFAULT true;
