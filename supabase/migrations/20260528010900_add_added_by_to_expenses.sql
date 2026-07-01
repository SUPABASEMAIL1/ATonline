-- Add added_by column to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_by TEXT;
