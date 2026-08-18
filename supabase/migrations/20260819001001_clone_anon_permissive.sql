-- ============================================================================
-- 20260819001001_clone_anon_permissive.sql
-- Idempotent anon-compat for ANY fresh clone created from SUPER_MASTER_SCHEMA.sql.
-- Mirrors supabase/migrations/20260819000000_restore_anon_compat.sql but DROPs
-- existing SELECT-only *_all policies first (master schema already created
-- those with the same name, causing "policy already exists").
-- ============================================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_all ON public.products;
CREATE POLICY products_all ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_all ON public.sales;
CREATE POLICY sales_all ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_all ON public.customers;
CREATE POLICY customers_all ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_all ON public.expenses;
CREATE POLICY expenses_all ON public.expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_all ON public.suppliers;
CREATE POLICY suppliers_all ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_transactions_all ON public.supplier_transactions;
CREATE POLICY supplier_transactions_all ON public.supplier_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_all ON public.app_settings;
CREATE POLICY app_settings_all ON public.app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_history_all ON public.stock_history;
CREATE POLICY stock_history_all ON public.stock_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.variant_stock_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS variant_stock_history_all ON public.variant_stock_history;
CREATE POLICY variant_stock_history_all ON public.variant_stock_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payment_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_movements_all ON public.payment_movements;
CREATE POLICY payment_movements_all ON public.payment_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payment_modes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_modes_all ON public.payment_modes;
CREATE POLICY payment_modes_all ON public.payment_modes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.row_tombstones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS row_tombstones_all ON public.row_tombstones;
CREATE POLICY row_tombstones_all ON public.row_tombstones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
