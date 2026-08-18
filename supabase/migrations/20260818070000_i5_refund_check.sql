-- ============================================================================
-- i5_refund_check (MASTER §7 I5)
-- Over-refund blocked at the DATABASE level for EVERY code path, including
-- process_return which previously had no server-side guard. A sale's cumulative
-- refunded_amount can never exceed its total (return/negative-total sales are
-- excluded from the constraint, matching the invariant_violations view).
-- Applied live 2026-08-17; 0 existing rows violate it.
-- ============================================================================

ALTER TABLE sales DROP CONSTRAINT IF EXISTS chk_sales_refund_not_exceed_total;

ALTER TABLE sales ADD CONSTRAINT chk_sales_refund_not_exceed_total
  CHECK (refunded_amount IS NULL OR total <= 0 OR refunded_amount <= total);
