-- ============================================================================
-- settings_rls (MASTER §2.1.4)
-- The app-layer RequireAccess is bypassable, so the DB adds defense-in-depth.
-- However this is a SINGLE-TENANT POS that writes app_settings from EVERY
-- authenticated role during the 30s heartbeat sync (syncEngine.ts:108/329), so a
-- strict admin/manager-only UPDATE policy would BREAK cashier sync. Resolution:
--   - SELECT: open (POS reads settings globally)
--   - INSERT: open (first-run setup)
--   - UPDATE: any LOGGED-IN user (current_user_role() IS NOT NULL). Unauthenticated
--             anon is still blocked. Sensitive sub-actions (delete_sale,
--             refund_sale) are independently guarded server-side in rpc_role_guards.sql.
--   - DELETE: admin/manager only (destructive; rarely used).
-- Service role bypasses RLS (expected). Settings PAGE access stays app-layer guarded.
-- ============================================================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select" ON app_settings;
DROP POLICY IF EXISTS "settings_insert" ON app_settings;
DROP POLICY IF EXISTS "settings_write" ON app_settings;
DROP POLICY IF EXISTS "settings_delete" ON app_settings;

CREATE POLICY "settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_write" ON app_settings FOR UPDATE
  USING (current_user_role() IS NOT NULL)
  WITH CHECK (current_user_role() IS NOT NULL);
CREATE POLICY "settings_delete" ON app_settings FOR DELETE
  USING (current_user_role() IN ('admin', 'manager'));
