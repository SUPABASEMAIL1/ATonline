-- ============================================================================
-- orphan_flag_all (MASTER §7 follow-up / data hygiene)
-- Broadens the orphan flag to ALL completed sales that reference a deleted or
-- missing product (217 rows at apply time). These sales can never be reconciled
-- because the product row no longer exists, so they are excluded from I4 by
-- design and flagged is_orphan=true so reports/UI can skip them cleanly without
-- destroying historical records. Non-destructive and reversible (set is_orphan
-- back to false to un-flag). Applied live 2026-08-17.
-- ============================================================================

UPDATE sales
SET is_orphan = true
WHERE status = 'completed'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(items) it
    WHERE (it->'product'->>'id') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = (it->'product'->>'id')::uuid)
  );
