-- Migration: Add hide_item_prices column to bundles table
-- This flag controls whether per-item original prices are shown or hidden
-- on the POS billing screen and printed receipt when a bundle/deal is active.
-- When TRUE: Only the deal's final total price is shown (not individual item prices).
-- When FALSE (default): Individual item prices + deal discount breakdown are shown.

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS hide_item_prices BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bundles.hide_item_prices IS
  'When true, per-item original prices are hidden on POS cart and receipt; only the deal final price is displayed.';
