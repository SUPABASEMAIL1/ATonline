-- Enable RLS on stock_history and variant_stock_history
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_stock_history ENABLE ROW LEVEL SECURITY;

-- 1. stock_history Policies
-- Allow anyone to read (needed for POS devices sync)
CREATE POLICY "Allow public read on stock_history" 
ON stock_history FOR SELECT 
TO public 
USING (true);

-- Allow authenticated users to insert (POS Cashiers/Admins)
CREATE POLICY "Allow authenticated insert on stock_history" 
ON stock_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow service_role to do everything
CREATE POLICY "Allow service_role ALL on stock_history" 
ON stock_history FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 2. variant_stock_history Policies
-- Allow anyone to read
CREATE POLICY "Allow public read on variant_stock_history" 
ON variant_stock_history FOR SELECT 
TO public 
USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Allow authenticated insert on variant_stock_history" 
ON variant_stock_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow service_role to do everything
CREATE POLICY "Allow service_role ALL on variant_stock_history" 
ON variant_stock_history FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
