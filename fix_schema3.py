import re

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'r') as f:
    content = f.read()

bad_pattern = 'CREATE POLICY "Allow public read on stock_history" ON stock_history'
good_pattern = 'DROP POLICY IF EXISTS "Allow public read on stock_history" ON stock_history;\nCREATE POLICY "Allow public read on stock_history" ON stock_history'

content = content.replace(bad_pattern, good_pattern)

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'w') as f:
    f.write(content)

print("Fixed")
