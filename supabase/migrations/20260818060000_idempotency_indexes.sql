-- ============================================================================
-- idempotency_indexes (MASTER §4 / §6)
-- Composite unique indexes prevent double-posting of the same ledger event
-- (sale / return / purchase) under concurrency when caller-generated ids differ.
-- This is the DB-level enforcement MASTER requires ("application-level checks
-- alone are not sufficient under concurrency").
--   * stock_history: one row per (reference, type, product). `adjustment` is
--     excluded because manual corrections legitimately post multiple rows for the
--     same reference.
--   * payment_movements: one row per (reference, mode, note). note carries the
--     reference type ('Sale ...' vs 'Reverse ...') so a sale + its refund pair
--     is allowed, but a duplicate sale/refund posting is rejected.
-- Applied live 2026-08-17 after removing 17 duplicate stock returns and 3
-- duplicate payment postings (see VERIFICATION_REPORT §B).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_history_idem
  ON stock_history(reference_id, type, product_id)
  WHERE reference_id IS NOT NULL AND type <> 'adjustment';

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_movements_idem
  ON payment_movements(reference_id, mode_id, note)
  WHERE reference_id IS NOT NULL;
