-- ==============================================================================
-- MIGRATION: BUNDLE SLOTS (COMBO DEALS)
-- ==============================================================================

-- 22. BUNDLE SLOTS
CREATE TABLE IF NOT EXISTS bundle_slots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    required_quantity   INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
    order_index         INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);

-- 23. BUNDLE SLOT OPTIONS
CREATE TABLE IF NOT EXISTS bundle_slot_options (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id             UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_slot_id ON bundle_slot_options(slot_id);
CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_product_id ON bundle_slot_options(product_id);
