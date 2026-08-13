-- Fix RLS for row_tombstones to allow anon/authenticated access (needed for POS client triggers and sync)
ALTER TABLE row_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow anon ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow authenticated ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
