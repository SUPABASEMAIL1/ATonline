-- Migration: Add print_delivery_address and print_qr_code toggles
-- Adds receipt_show_delivery_address and receipt_show_qr_code columns
-- Default true to preserve existing behavior

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS receipt_show_delivery_address BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_qr_code BOOLEAN DEFAULT true;

DO $$
BEGIN
  RAISE NOTICE '✅ receipt_show_delivery_address and receipt_show_qr_code columns added';
END $$;
