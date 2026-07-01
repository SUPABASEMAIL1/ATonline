-- ADD touch_keyboard_enabled column to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS touch_keyboard_enabled BOOLEAN DEFAULT false;
