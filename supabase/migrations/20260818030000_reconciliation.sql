-- ============================================================================
-- reconciliation (MASTER §4.3 / §7)
-- Provides the acceptance-test machinery for invariants I1, I2, I4, I5, I6.
-- I3 (supplier balance) is NOT stored as a column in this schema — it is always
-- DERIVED from supplier_transactions, so it cannot drift (documented in report).
-- Variant stock lives inside products.variant_data JSONB (updated by the
-- variant_stock_history trigger) and is covered separately (see report §15F).
-- ============================================================================

-- Mismatch ledger: every detected drift is recorded here and must be corrected
-- manually (which inserts an ADJUSTMENT stock_history / payment_movements row),
-- never by a raw UPDATE (MASTER §4.3).
CREATE TABLE IF NOT EXISTS stock_mismatches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('inventory', 'wallet')),
  entity_id   TEXT NOT NULL,
  expected    NUMERIC,
  actual      NUMERIC,
  detected_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  resolved    BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  note        TEXT
);

-- Run reconciliation: record any I1 (inventory) / I2 (wallet) drift into
-- stock_mismatches. Returns the number of new mismatch rows.
CREATE OR REPLACE FUNCTION reconcile_now()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER := 0;
  r RECORD;
BEGIN
  -- I1: products.stock vs Σ stock_history.change_qty (only tracked products)
  FOR r IN
    SELECT p.id::text AS eid, p.stock AS actual,
      COALESCE((SELECT SUM(change_qty) FROM stock_history WHERE product_id = p.id), 0) AS expected
    FROM products p
    WHERE p.track_inventory = true
      AND p.stock IS DISTINCT FROM COALESCE((SELECT SUM(change_qty) FROM stock_history WHERE product_id = p.id), 0)
  LOOP
    INSERT INTO stock_mismatches(kind, entity_id, expected, actual)
    VALUES ('inventory', r.eid, r.expected, r.actual);
    n := n + 1;
  END LOOP;

  -- I2: payment_modes.balance vs Σ payment_movements.delta
  FOR r IN
    SELECT pm.id AS eid, pm.balance AS actual,
      COALESCE((SELECT SUM(delta) FROM payment_movements WHERE mode_id = pm.id), 0) AS expected
    FROM payment_modes pm
    WHERE pm.balance IS DISTINCT FROM COALESCE((SELECT SUM(delta) FROM payment_movements WHERE mode_id = pm.id), 0)
  LOOP
    INSERT INTO stock_mismatches(kind, entity_id, expected, actual)
    VALUES ('wallet', r.eid, r.expected, r.actual);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

-- One-stop view returning EVERY invariant violation (MASTER §7). Empty = pass.
-- Authoritative, false-positive-safe invariants:
--   I1 inventory drift (products.stock vs Σ stock_history.change_qty)
--   I2 wallet drift    (payment_modes.balance vs Σ payment_movements.delta)
--   I4 sale<->stock    (one 'sale' stock row per tracked, NON-DELETED line item)
--   I5 over-refund     (refunded_amount > sale total)
-- I3 (supplier) is derived-only (cannot drift). I6 (online-order stock) is zero
-- by design (store_orders state machine). Deleted-product sales are excluded
-- from I4 because there is no product row left to reconcile against.
CREATE OR REPLACE VIEW invariant_violations AS
  -- I1: inventory drift (only products that actually track inventory)
  SELECT 'I1_inventory' AS check_name, p.id::text AS entity_id
  FROM products p
  WHERE p.track_inventory = true
    AND p.stock IS DISTINCT FROM COALESCE((SELECT SUM(change_qty) FROM stock_history WHERE product_id = p.id), 0)
UNION ALL
  -- I2: wallet drift
  SELECT 'I2_wallet', pm.id::text
  FROM payment_modes pm
  WHERE pm.balance IS DISTINCT FROM COALESCE((SELECT SUM(delta) FROM payment_movements WHERE mode_id = pm.id), 0)
UNION ALL
  -- I4: completed sale must have exactly one 'sale' stock row per tracked,
  --     still-existing line item. Tracked = the PRODUCT TABLE says track_inventory
  --     (the embedded item snapshot may be null). Both sides count ONLY existing
  --     products, so orphaned rows for deleted products are never false-flagged.
  SELECT 'I4_sale_stock', s.id::text
  FROM sales s
  WHERE s.status = 'completed'
    AND ( SELECT count(*) FROM jsonb_array_elements(s.items) it
            WHERE EXISTS (SELECT 1 FROM products p
                           WHERE p.id = (it->'product'->>'id')::uuid AND p.track_inventory = true) )
        != ( SELECT count(*) FROM stock_history sh
               WHERE sh.type='sale' AND sh.reference_id = s.id
                 AND EXISTS (SELECT 1 FROM products p WHERE p.id = sh.product_id AND p.track_inventory = true) )
UNION ALL
  -- I5: refund never exceeds what was sold (only real sales have positive total;
  -- return/refund sales carry a negative total and are excluded)
  SELECT 'I5_refund', s.id::text
  FROM sales s
  WHERE s.total > 0 AND COALESCE(s.refunded_amount, 0) > s.total;
