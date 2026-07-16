-- Add sort_order column to bundle_slot_options for drag-and-drop reordering
-- of deal slot options. Existing rows get sort_order = 0 (default).

ALTER TABLE bundle_slot_options
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Update existing rows to have sequential sort_order within each slot
-- based on created_at (oldest first)
UPDATE bundle_slot_options bso
SET sort_order = sub.new_order
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY slot_id ORDER BY created_at ASC
  ) - 1 AS new_order
  FROM bundle_slot_options
) sub
WHERE bso.id = sub.id;
