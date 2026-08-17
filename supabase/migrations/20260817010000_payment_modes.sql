-- Migration: per-method payment wallets (cash/card/online/wallet)
-- Adds payment_modes (authoritative balances) + payment_movements ledger
-- and the idempotent apply_payment_movements RPC.

CREATE TABLE IF NOT EXISTS payment_modes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    icon        TEXT DEFAULT 'wallet',
    balance     NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payment_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_modes REPLICA IDENTITY FULL;
DROP POLICY IF EXISTS "Allow all for authenticated" ON payment_modes;
CREATE POLICY "Allow all for authenticated" ON payment_modes FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS payment_movements (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mode_id      TEXT NOT NULL REFERENCES payment_modes(id) ON DELETE CASCADE,
    delta        NUMERIC(14,2) NOT NULL,
    reference_id UUID,
    note         TEXT,
    created_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE payment_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_movements REPLICA IDENTITY FULL;
DROP POLICY IF EXISTS "Allow all for authenticated" ON payment_movements;
CREATE POLICY "Allow all for authenticated" ON payment_movements FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION apply_payment_movements(p_moves jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  h jsonb;
BEGIN
  FOR h IN SELECT * FROM jsonb_array_elements(p_moves)
  LOOP
    INSERT INTO payment_movements (id, mode_id, delta, reference_id, note, created_at)
    VALUES (
      COALESCE((h->>'id')::uuid, uuid_generate_v4()),
      h->>'mode_id',
      (h->>'delta')::numeric,
      NULLIF(h->>'reference_id','')::uuid,
      h->>'note',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN
      UPDATE payment_modes SET balance = balance + (h->>'delta')::numeric, updated_at = now()
      WHERE id = h->>'mode_id';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION apply_payment_movements(jsonb) TO anon, authenticated, service_role;
