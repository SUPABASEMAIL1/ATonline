-- Add language column to app_settings table
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
