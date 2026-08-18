-- ============================================================================
-- 20260819010000_fix_drifted_schemas.sql
-- ============================================================================
-- WHY: minimahal & pizzamilano DBs were behind the master schema (their
-- migrations never ran). Two gaps broke the anon-key data path after the
-- 2026-08-18 hardening revert:
--   1. `sales.idempotency_key` column missing -> commit_sale() INSERT failed
--      (the function references it).
--   2. `sales_status_check` constraint did NOT allow 'deleted'/'cancelled'
--      -> delete_sale_atomic() (sets status='deleted') raised check violation.
-- jeanzone already had both. This migration makes every DB consistent and is
-- idempotent (safe to re-run / on fresh clones).
-- Applied live to genmpxcnmdcfwwymjibd (jeanzone), pdctcoicqcyhsgdjnwil
-- (minimahal), dkmvcprbssnyxnlolgcd (pizzamilano) on 2026-08-18.
-- ============================================================================

-- 1. Ensure idempotency_key column exists (no-op where already present)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key ON public.sales (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Align sales_status_check with the app's soft-delete / cancel semantics
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'completed'::text, 'refunded'::text,
    'partially_refunded'::text, 'credit'::text, 'draft'::text,
    'deleted'::text, 'cancelled'::text
  ]));
