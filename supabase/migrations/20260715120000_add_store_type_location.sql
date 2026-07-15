-- Add store_type, store_latitude, store_longitude to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS store_type TEXT DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS store_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS store_longitude NUMERIC;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
