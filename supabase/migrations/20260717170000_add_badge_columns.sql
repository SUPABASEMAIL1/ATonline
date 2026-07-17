-- Add custom badge system columns to bundles table
-- Each bundle can have an optional badge with custom text, icon, colors
-- Created: 2026-07-17

ALTER TABLE bundles ADD COLUMN IF NOT EXISTS badge_enabled BOOLEAN DEFAULT false;
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS badge_text TEXT;
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS badge_icon TEXT DEFAULT 'crown';
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS badge_bg_color TEXT DEFAULT '#1A1A1A';
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS badge_text_color TEXT DEFAULT '#D4AF37';

-- Set defaults for existing Crown Crust deals
UPDATE bundles SET
  badge_enabled = true,
  badge_text = 'CROWN',
  badge_icon = 'crown',
  badge_bg_color = '#1A1A1A',
  badge_text_color = '#D4AF37'
WHERE name ILIKE 'crown crust%';
