-- Migration: Add salesmen table + salesman fields to sales
-- Date: 2026-08-03

-- 1. Create salesmen table
CREATE TABLE IF NOT EXISTS salesmen (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    phone       TEXT,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE salesmen ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesmen REPLICA IDENTITY FULL;

CREATE POLICY "Allow all for authenticated" ON salesmen
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Add salesman columns to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES salesmen(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS salesman_name TEXT;

-- 3. Enable realtime for salesmen
ALTER PUBLICATION supabase_realtime ADD TABLE salesmen;
