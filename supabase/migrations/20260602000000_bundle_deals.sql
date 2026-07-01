-- ============================================================
-- MIGRATION: Bundle/Deal Feature
-- Date: 2026-06-02
-- Description: Creates bundles and bundle_items tables with RLS
-- ============================================================

-- 1. BUNDLES TABLE
CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate bundle names per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundles_name_workspace
  ON bundles (workspace_id, LOWER(TRIM(name)));

-- 2. BUNDLE_ITEMS TABLE
CREATE TABLE IF NOT EXISTS bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle_id ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product_id ON bundle_items(product_id);

-- 3. RLS POLICIES

ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_items ENABLE ROW LEVEL SECURITY;

-- Bundles: workspace members can read, admin/manager can write
CREATE POLICY "bundles_select" ON bundles
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "bundles_insert" ON bundles
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM users WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "bundles_update" ON bundles
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM users WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "bundles_delete" ON bundles
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM users WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- Bundle items follow bundle access
CREATE POLICY "bundle_items_select" ON bundle_items
  FOR SELECT USING (
    bundle_id IN (
      SELECT id FROM bundles WHERE workspace_id IN (
        SELECT workspace_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "bundle_items_insert" ON bundle_items
  FOR INSERT WITH CHECK (
    bundle_id IN (
      SELECT id FROM bundles WHERE workspace_id IN (
        SELECT workspace_id FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "bundle_items_update" ON bundle_items
  FOR UPDATE USING (
    bundle_id IN (
      SELECT id FROM bundles WHERE workspace_id IN (
        SELECT workspace_id FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "bundle_items_delete" ON bundle_items
  FOR DELETE USING (
    bundle_id IN (
      SELECT id FROM bundles WHERE workspace_id IN (
        SELECT workspace_id FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
      )
    )
  );

-- 4. UPDATED_AT trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_bundles_updated_at ON bundles;
CREATE TRIGGER set_bundles_updated_at
  BEFORE UPDATE ON bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
