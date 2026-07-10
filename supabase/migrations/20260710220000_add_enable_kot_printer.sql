-- Migration: Add enable_kot_printer column to app_settings
-- Date: 2026-07-10
-- 
-- This column was missing from the live DB but present in the code/UI.
-- The KOT toggle was rendering as a solid black square because formData
-- couldn't bind to the missing field.

ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS enable_kot_printer BOOLEAN DEFAULT false;

-- Update Realtime publication to include the new column
-- (SET TABLE is idempotent — already done in master schema)
