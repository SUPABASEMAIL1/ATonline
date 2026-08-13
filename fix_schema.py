import re

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'r') as f:
    content = f.read()

bad_pattern = """DROP POLICY IF EXISTS "Allow service_role ALL on row_tombstones" ON row_tombstones;
  TO service_role
  USING (true) WITH CHECK (true);"""

good_pattern = """DROP POLICY IF EXISTS "Allow service_role ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow service_role ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);"""

content = content.replace(bad_pattern, good_pattern)

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'w') as f:
    f.write(content)

print("Fixed")
