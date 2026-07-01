-- ============================================================
-- Migration: 20260509191900_split_payments_rls_fix.sql
-- Date: 2026-05-09
-- Description:
--   1. Add split_payments JSONB column to sales table
--   2. Deploy get_my_workspace_id() function (was missing from DB)
--   3. Fix app_settings RLS — replace permissive 'true' policies with
--      workspace-scoped policies
--   4. Fix users RLS — replace permissive SELECT/UPDATE 'true' with
--      proper workspace-scoped policies
-- ============================================================

-- 1. Add split_payments column to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS split_payments JSONB DEFAULT '[]';

-- 2. Deploy workspace helper function
CREATE OR REPLACE FUNCTION get_my_workspace_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT workspace_id
    FROM users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_my_workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_workspace_id() TO anon;

-- 3. Fix app_settings RLS (was qual=true, now workspace-scoped)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_isolation ON app_settings;
DROP POLICY IF EXISTS settings_select ON app_settings;
DROP POLICY IF EXISTS settings_insert ON app_settings;
DROP POLICY IF EXISTS settings_update ON app_settings;
DROP POLICY IF EXISTS settings_delete ON app_settings;

CREATE POLICY settings_select ON app_settings
  FOR SELECT TO authenticated
  USING (workspace_id = get_my_workspace_id());

CREATE POLICY settings_insert ON app_settings
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_my_workspace_id());

CREATE POLICY settings_update ON app_settings
  FOR UPDATE TO authenticated
  USING (workspace_id = get_my_workspace_id())
  WITH CHECK (workspace_id = get_my_workspace_id());

CREATE POLICY settings_delete ON app_settings
  FOR DELETE TO authenticated
  USING (workspace_id = get_my_workspace_id());

-- 4. Fix users RLS (was qual=true SELECT, now workspace-scoped)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON users;
DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;

CREATE POLICY users_select_policy ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR workspace_id = get_my_workspace_id());

CREATE POLICY users_update_policy ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR workspace_id = get_my_workspace_id())
  WITH CHECK (id = auth.uid() OR workspace_id = get_my_workspace_id());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'split_payments';
SELECT proname FROM pg_proc WHERE proname = 'get_my_workspace_id';
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('app_settings','users') ORDER BY tablename, cmd;
