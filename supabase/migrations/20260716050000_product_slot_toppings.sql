-- ============================================================
-- Migration: product_toppings + bundle_slot_toppings join tables
-- Allows admin to enable/disable specific toppings per product
-- and per deal slot independently.
-- ============================================================

-- 1. PRODUCT TOPPINGS (which toppings are available for a product)

CREATE TABLE IF NOT EXISTS product_toppings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    topping_id  UUID NOT NULL REFERENCES toppings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_id, topping_id)
);

CREATE INDEX IF NOT EXISTS idx_product_toppings_product ON product_toppings(product_id);

GRANT SELECT, INSERT, DELETE ON TABLE product_toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE product_toppings TO service_role;

-- 2. BUNDLE SLOT TOPPINGS (which toppings are available for a deal slot)

CREATE TABLE IF NOT EXISTS bundle_slot_toppings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id     UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
    topping_id  UUID NOT NULL REFERENCES toppings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(slot_id, topping_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_slot_toppings_slot ON bundle_slot_toppings(slot_id);

GRANT SELECT, INSERT, DELETE ON TABLE bundle_slot_toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE bundle_slot_toppings TO service_role;

-- Seed: enable all 3 toppings for all existing products
INSERT INTO product_toppings (product_id, topping_id)
SELECT p.id, t.id FROM products p CROSS JOIN toppings t
ON CONFLICT DO NOTHING;

-- Seed: enable all 3 toppings for all existing bundle slots
INSERT INTO bundle_slot_toppings (slot_id, topping_id)
SELECT bs.id, t.id FROM bundle_slots bs CROSS JOIN toppings t
ON CONFLICT DO NOTHING;
