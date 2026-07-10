-- Migration: Fix refund system — partially_refunded status, refunded_amount column, process_return RPC
-- Date: 2026-07-10
--
-- Fixes 6 bugs:
-- 1. DB CHECK constraint missing 'partially_refunded' — SQL was rejecting partial refunds
-- 2. process_return RPC hardcoded 'refunded' status — no partial support
-- 3. process_return RPC never updated refunded_amount column — column was missing
-- 4. process_return RPC never restored items JSONB — stale items after refund
-- 5. syncEngine.ts checked 'returned' instead of 'refunded' — RPC never triggered
-- 6. Report queries missed 'partially_refunded' sales

-- 1. Drop old CHECK constraint and recreate with partially_refunded
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'credit', 'draft'));

-- 2. Add missing refunded_amount column
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12,2) DEFAULT 0;

-- 3. process_return RPC is updated via SUPER_MASTER_SCHEMA.sql (CREATE OR REPLACE)
-- Run the full schema to pick up the new RPC definition
