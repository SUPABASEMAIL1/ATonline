-- ═══════════════════════════════════════════════════════════════════
-- Migration: Ensure stock_history.type CHECK allows all 7 types
-- 
-- The previous CHECK constraint had the correct types, but the
-- sync engine (syncEngine.ts) was lossily mapping 'stock_in' → 
-- 'purchase' and 'adjustment_out' → 'adjustment'. This migration
-- re-asserts the constraint so the DB allows all types used locally.
--
-- Types: sale, purchase, stock_in, return, adjustment, initial, adjustment_out
-- ═══════════════════════════════════════════════════════════════════

-- Recreate constraint to ensure it matches the canonical list
ALTER TABLE stock_history DROP CONSTRAINT IF EXISTS stock_history_type_check;

ALTER TABLE stock_history ADD CONSTRAINT stock_history_type_check
  CHECK (type IN (
    'sale',
    'purchase',
    'stock_in',
    'return',
    'adjustment',
    'initial',
    'adjustment_out'
  ));
