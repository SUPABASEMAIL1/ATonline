-- ============================================================================
-- orphan_sales_flag (data hygiene, MASTER §7 follow-up)
-- 115 completed sales reference products that were later DELETED. Their stock
-- rows can never be reconciled (no product row exists), so they are excluded
-- from I4 by design. This column lets the app/reports skip them cleanly without
-- destroying historical records. Non-destructive and reversible.
-- ============================================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false;

UPDATE sales
SET is_orphan = true
WHERE status = 'completed'
  AND id IN (
    SELECT DISTINCT s.id
    FROM sales s, jsonb_array_elements(s.items) it
    WHERE s.status = 'completed'
      AND it->>'variantId' IS NULL AND (it->'variant'->>'id') IS NULL
      AND (it->'product'->>'track_inventory')::boolean = true
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = (it->'product'->>'id')::uuid)
      AND NOT EXISTS (SELECT 1 FROM stock_history sh
                       WHERE sh.reference_id = s.id
                         AND sh.product_id = (it->'product'->>'id')::uuid
                         AND sh.type = 'sale')
  );
