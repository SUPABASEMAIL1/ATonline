-- ════════════════════════════════════════════════════════════════
-- [2026-07-31] FIX: Add updated_at to 5 tables missing it
-- ──────────────────────────────────────────────────────────────────
-- Issue: Delta sync queries `updated_at=gte.X` on supplier_transactions,
--   payments, stock_history, variant_stock_history, product_addons —
--   but these tables only had `created_at`. Supabase REST returned
--   400 (Bad Request) and the code fell back to full-table fetches
--   every sync (console: "[stockHistory] Delta sync failed, fetching all").
-- Fix: Add updated_at TIMESTAMPTZ (default now(), NOT NULL) + trigger
--   via update_updated_at_column() so delta sync works for all tables.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE supplier_transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE stock_history
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE variant_stock_history
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE product_addons
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Triggers (idempotent — update_updated_at_column() already exists in master schema)
DO $$ BEGIN CREATE TRIGGER update_supplier_transactions_updated_at BEFORE UPDATE ON supplier_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_payments_updated_at              BEFORE UPDATE ON payments              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_stock_history_updated_at         BEFORE UPDATE ON stock_history         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_variant_stock_history_updated_at BEFORE UPDATE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_product_addons_updated_at        BEFORE UPDATE ON product_addons        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: set updated_at = created_at so past rows participate in delta sync
UPDATE supplier_transactions SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE payments              SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE stock_history         SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE variant_stock_history SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE product_addons        SET updated_at = created_at WHERE updated_at IS NULL;
