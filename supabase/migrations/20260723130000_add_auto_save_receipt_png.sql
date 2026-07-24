-- Migration: Add auto_save_receipt_png column to app_settings
-- Date: 2026-07-23
-- Description: Adds a setting toggle for auto-saving receipt PNG to device storage

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS auto_save_receipt_png BOOLEAN DEFAULT false;
