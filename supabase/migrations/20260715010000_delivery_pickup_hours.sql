-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add Delivery & Pickup Operating Hours
-- Adds shop open/close, delivery hours, and pickup hours to app_settings
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS shop_open_time TIME,
  ADD COLUMN IF NOT EXISTS shop_close_time TIME,
  ADD COLUMN IF NOT EXISTS delivery_start_time TIME,
  ADD COLUMN IF NOT EXISTS delivery_end_time TIME,
  ADD COLUMN IF NOT EXISTS pickup_start_time TIME,
  ADD COLUMN IF NOT EXISTS pickup_end_time TIME;
