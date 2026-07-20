-- ================================================================
-- [2026-07-18] Variation Inventory — Per-variant stock history + Add-on products
-- ================================================================
-- Creates two new tables:
--   1. variant_stock_history — per-variant (VariantData) stock change audit trail
--   2. product_addons        — inventory-tracked products that can be added as add-ons
-- These are required for accurate variation-level inventory tracking and reporting.
-- ================================================================

-- 1. Per-variant stock change history
CREATE TABLE IF NOT EXISTS variant_stock_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id      TEXT NOT NULL,              -- VariantData.id
    variant_label   TEXT,                       -- Human-readable label e.g. "M / Red"
    change_qty      INTEGER NOT NULL,           -- negative = sold/deducted
    type            TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'return', 'adjustment', 'initial')),
    reference_id    UUID,                       -- sale ID / purchase ID
    note            TEXT,
    balance_after   INTEGER,
    cashier_name    TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variant_stock_history_product ON variant_stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_stock_history_variant ON variant_stock_history(product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_stock_history_date ON variant_stock_history(created_at DESC);

GRANT ALL ON variant_stock_history TO anon, authenticated, service_role;

-- 2. Product add-ons (inventory-tracked products assigned as add-ons to another product)
CREATE TABLE IF NOT EXISTS product_addons (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID REFERENCES products(id) ON DELETE CASCADE,  -- parent product
    addon_product_id    UUID REFERENCES products(id) ON DELETE CASCADE,  -- the add-on product (tracked separately)
    name                TEXT NOT NULL,
    price               DECIMAL(10,2) DEFAULT 0,
    max_qty             INTEGER DEFAULT 1,
    active              BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_addons_product ON product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_product_addons_addon ON product_addons(addon_product_id);

GRANT ALL ON product_addons TO anon, authenticated, service_role;
