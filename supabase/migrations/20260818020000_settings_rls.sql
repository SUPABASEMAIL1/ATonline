-- ============================================================================
-- settings_rls (MASTER §2.1.4)
-- The app-layer RequireAccess is bypassable; the database must reject
-- unauthorized writes to settings. Reads stay open (the POS reads settings
-- globally); inserts stay open (first-run setup); UPDATE/DELETE restricted to
-- admin/manager. Service role bypasses RLS (expected).
-- ============================================================================

-- NOTE: table is `app_settings` (not `settings`). This migration is intentionally
-- NOT applied to the live DB as-is: the app writes app_settings from every
-- authenticated role during the 30s heartbeat sync (syncEngine.ts:108/329), so a
-- strict admin/manager-only UPDATE policy would break sync for cashiers. Apply
-- only after refactoring settings writes through a privileged server path.

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select" ON app_settings;
DROP POLICY IF EXISTS "settings_insert" ON app_settings;
DROP POLICY IF EXISTS "settings_write" ON app_settings;
DROP POLICY IF EXISTS "settings_delete" ON app_settings;

CREATE POLICY "settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_write" ON app_settings FOR UPDATE
  USING (current_user_role() IN ('admin', 'manager'))
  WITH CHECK (current_user_role() IN ('admin', 'manager'));
CREATE POLICY "settings_delete" ON app_settings FOR DELETE
  USING (current_user_role() IN ('admin', 'manager'));
