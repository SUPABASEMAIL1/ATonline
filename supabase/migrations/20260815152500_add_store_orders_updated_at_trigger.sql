-- 20260815152500_add_store_orders_updated_at_trigger.sql
-- Add missing F21 updated_at trigger for store_orders
DO $$ BEGIN CREATE TRIGGER update_store_orders_updated_at BEFORE UPDATE ON store_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
