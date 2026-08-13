import re

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'r') as f:
    content = f.read()

# Simply remove those specific trailing lines
bad_pattern = """  TO authenticated
  USING (true) WITH CHECK (true);
  TO service_role
  USING (true) WITH CHECK (true);"""

good_pattern = """  TO authenticated
  USING (true) WITH CHECK (true);"""

content = content.replace(bad_pattern, good_pattern)

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'w') as f:
    f.write(content)

print("Fixed")
