-- Add advanced theme and order timer columns to app_settings

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS estore_primary_color_hover TEXT DEFAULT '#059669',
  ADD COLUMN IF NOT EXISTS estore_bg_color TEXT DEFAULT '#f9fafb',
  ADD COLUMN IF NOT EXISTS estore_text_color TEXT DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS estore_card_bg_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS estore_order_timer_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estore_order_timer_minutes INTEGER DEFAULT 30;
