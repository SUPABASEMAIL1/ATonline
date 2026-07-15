ALTER TABLE settings 
  ADD COLUMN IF NOT EXISTS estore_custom_payment_enabled  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_name     TEXT,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_detail   TEXT,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_note     TEXT;
