with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'r') as f:
    content = f.read()

content = content.replace('CREATE POLICY "Allow public read on stock_history"', 'DROP POLICY IF EXISTS "Allow public read on stock_history" ON stock_history;\nCREATE POLICY "Allow public read on stock_history"')
content = content.replace('CREATE POLICY "Allow authenticated insert on stock_history"', 'DROP POLICY IF EXISTS "Allow authenticated insert on stock_history" ON stock_history;\nCREATE POLICY "Allow authenticated insert on stock_history"')
content = content.replace('CREATE POLICY "Allow service_role ALL on stock_history"', 'DROP POLICY IF EXISTS "Allow service_role ALL on stock_history" ON stock_history;\nCREATE POLICY "Allow service_role ALL on stock_history"')

content = content.replace('CREATE POLICY "Allow public read on variant_stock_history"', 'DROP POLICY IF EXISTS "Allow public read on variant_stock_history" ON variant_stock_history;\nCREATE POLICY "Allow public read on variant_stock_history"')
content = content.replace('CREATE POLICY "Allow authenticated insert on variant_stock_history"', 'DROP POLICY IF EXISTS "Allow authenticated insert on variant_stock_history" ON variant_stock_history;\nCREATE POLICY "Allow authenticated insert on variant_stock_history"')
content = content.replace('CREATE POLICY "Allow service_role ALL on variant_stock_history"', 'DROP POLICY IF EXISTS "Allow service_role ALL on variant_stock_history" ON variant_stock_history;\nCREATE POLICY "Allow service_role ALL on variant_stock_history"')

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'w') as f:
    f.write(content)

print("Fixed")
