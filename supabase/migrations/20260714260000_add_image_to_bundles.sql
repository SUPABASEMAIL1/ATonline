-- Add image column to bundles table
ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS image TEXT;
