-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Stale-Write Guards (Cross-Device Conflict) + Variant Restock Ledger
-- Date: 2026-08-12
-- ───────────────────────────────────────────────────────────────────────────
-- F21 — STALE-WRITE GUARD (PERMANENT, server-enforced):
--   * row_tombstones table records every DELETE of a financial ledger row.
--   * guard_stale_write() BEFORE INSERT/UPDATE rejects:
--       (a) ANY write to a tombstoned id (a deleted row can NEVER resurrect —
--           queued deletes survive stale updates from any device, F17 now DB-enforced)
--       (b) UPDATEs whose client updated_at is OLDER than the stored row
--           (last-write-wins replaced by NEWEST-WINS; remote authoritative)
--   * update_updated_at_column() now PRESERVES the client timestamp when it is
--     newer than the stored row (previously it always stamped NOW(), which made
--     client timestamps worthless and stale-write detection impossible).
--   * SyncEngine handles the raised error (SQLSTATE P0007 "STALE_WRITE"):
--     drops the stale op and refreshes local from cloud (cloud = truth).
--   * NOT applied to products/customers/suppliers — variation re-creation
--     (child product ids reused after variant removal) must stay possible.
--     Those tables keep the client-side updated_at skip in SyncEngine.
--
-- F22 — VARIANT-RESTOCK LEDGER:
--   * purchase_records gains variant_id / variant_label so stock-in can be
--     targeted at one variant (variant_stock_history trigger updates
--     products.variant_data[].stock — same mechanism as sales/returns).
── ═══════════════════════════════════════════════════════════════════════════

-- ── 1. TOMBSTONE REGISTRY ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS row_tombstones (
  table_name TEXT NOT NULL,
  ref_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_row_tombstones_ref ON row_tombstones(ref_id);

GRANT ALL ON row_tombstones TO anon, authenticated, service_role;

ALTER TABLE row_tombstones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow service_role ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. PRESERVE CLIENT TIMESTAMPS (newest-wins foundation) ────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. STALE-WRITE GUARD ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_stale_write()
RETURNS TRIGGER AS $$
BEGIN
  -- (a) A deleted row can never come back (tombstone blocks resurrect).
  IF EXISTS (
    SELECT 1 FROM row_tombstones
    WHERE table_name = TG_TABLE_NAME AND ref_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'STALE_WRITE: record % was deleted from % on another device (or this one). Refresh from cloud — this stale write was rejected.', NEW.id, TG_TABLE_NAME
      USING ERRCODE = 'P0007';
  END IF;
  -- (b) Newest-wins: reject writes older than the stored row.
  IF TG_OP = 'UPDATE' AND NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'STALE_WRITE: remote % row % is NEWER (cloud %) than this local change (%). Refresh from cloud — this stale write was rejected.', TG_TABLE_NAME, NEW.id, OLD.updated_at, NEW.updated_at
      USING ERRCODE = 'P0007';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. TOMBSTONE RECORDER ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_row_tombstone()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO row_tombstones (table_name, ref_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.id, COALESCE(OLD.updated_at, NOW()))
  ON CONFLICT (table_name, ref_id)
  DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── 5. ATTACH GUARDS TO FINANCIAL LEDGER TABLES ───────────────────────────
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_sales              BEFORE INSERT OR UPDATE ON sales                FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_stock_history      BEFORE INSERT OR UPDATE ON stock_history         FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_variant_history    BEFORE INSERT OR UPDATE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_purchase_records   BEFORE INSERT OR UPDATE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_expenses           BEFORE INSERT OR UPDATE ON expenses              FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_payments           BEFORE INSERT OR UPDATE ON payments              FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_store_orders       BEFORE INSERT OR UPDATE ON store_orders          FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER guard_stale_write_sales_tabs         BEFORE INSERT OR UPDATE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION guard_stale_write();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER record_tombstone_sales               AFTER DELETE ON sales                FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_stock_history       AFTER DELETE ON stock_history         FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_variant_history     AFTER DELETE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_purchase_records    AFTER DELETE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_expenses            AFTER DELETE ON expenses              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_payments            AFTER DELETE ON payments              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_store_orders        AFTER DELETE ON store_orders          FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER record_tombstone_sales_tabs          AFTER DELETE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION record_row_tombstone();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. VARIANT RESTOCK LEDGER: purchase_records variant columns ──────────
ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS variant_label TEXT;