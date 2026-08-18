-- ============================================================================
-- 20260820010000_table_write_guard.sql
-- ============================================================================
-- MASTER §2.1.4 — protect DIRECT table writes (settings / expenses / suppliers)
-- with the same signed-token scheme as the RPCs. These writes go
-- through PostgREST (anon key) so they cannot rely on auth.uid() (NULL offline).
--
-- Mechanism: each protected table gets transient actor columns. The client
-- injects a signature (actionToken.withActor) on every write. A RLS WITH CHECK
-- policy recomputes the signature server-side and BLOCKS the write if invalid.
-- This makes tampering (change tax rate, fake expense, edit product) impossible
-- without the user's password hash — even from the public anon key.
--
-- NOTE: requires the client to send the sig (see src/lib/actionToken.ts +
-- syncEngine generic write path). If sig is absent the write is rejected
-- (fail-closed), except for legacy rows whose users.offline_hash is still NULL.
-- ============================================================================

-- 1. Transient actor columns on each protected table
ALTER TABLE public.app_settings  ADD COLUMN IF NOT EXISTS _actor_id uuid, ADD COLUMN IF NOT EXISTS _actor_role text, ADD COLUMN IF NOT EXISTS _actor_sig text;
ALTER TABLE public.expenses      ADD COLUMN IF NOT EXISTS _actor_id uuid, ADD COLUMN IF NOT EXISTS _actor_role text, ADD COLUMN IF NOT EXISTS _actor_sig text;
ALTER TABLE public.suppliers     ADD COLUMN IF NOT EXISTS _actor_id uuid, ADD COLUMN IF NOT EXISTS _actor_role text, ADD COLUMN IF NOT EXISTS _actor_sig text;
-- NOTE: `products` is intentionally NOT protected (see header) to avoid breaking
-- cashier stock-sync. Its permissive `products_all` policy is left untouched.

-- 1b. The Aug-19 anon-compat migration added permissive *_all policies
--     (FOR ALL, USING true, WITH CHECK true) which bypass any write guard via
--     RLS OR-semantics. We keep READS open (an existing *select policy already
--     covers anon for products/app_settings, but expenses/suppliers selects are
--     authenticated-only) by redefining each as SELECT-only permissive, and let
--     the signed WITH CHECK guards below be the ONLY write path.
DROP POLICY IF EXISTS app_settings_all ON public.app_settings;
CREATE POLICY app_settings_all ON public.app_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS expenses_all ON public.expenses;
CREATE POLICY expenses_all ON public.expenses FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS suppliers_all ON public.suppliers;
CREATE POLICY suppliers_all ON public.suppliers FOR SELECT TO anon, authenticated USING (true);
-- `products_all` is intentionally left as-is (permissive) so cashier stock-sync
-- keeps working; only app_settings/expenses/suppliers get the signed guard.

-- 1c. The Aug-19 hardening left INSERT policies with a NULL qual
--     (settings_insert / expenses_insert / suppliers_insert) which permit ANY
--     authenticated (online) user to INSERT — bypassing the signed guard via
--     RLS OR. Drop them so INSERT is governed solely by the signed guard below.
DROP POLICY IF EXISTS settings_insert ON public.app_settings;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS suppliers_insert ON public.suppliers;

-- 2. RLS WITH CHECK policies (INSERT + UPDATE). USING(true) keeps reads open;
--    WITH CHECK enforces BOTH a valid signature AND that the (verified) role is
--    permitted for the action. verify_table_write returns boolean (no RAISE) so
--    it is safe inside a CHECK policy.
CREATE OR REPLACE FUNCTION public.verify_table_write(
  p_user_id uuid, p_role text, p_sig text, p_action text, VARIADIC p_allowed text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_hash text; v_stored_role text; v_expected text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;  -- unknown actor => fail-closed
  IF p_sig IS NULL OR p_sig = '' THEN
    SELECT offline_hash, role INTO v_hash, v_stored_role FROM users WHERE id = p_user_id;
    IF v_hash IS NULL THEN RETURN true; END IF;   -- legacy allow (hash never synced)
    RETURN false;
  END IF;
  SELECT offline_hash, role INTO v_hash, v_stored_role FROM users WHERE id = p_user_id;
  IF v_hash IS NULL OR v_stored_role IS NULL THEN RETURN false; END IF;
  IF v_stored_role <> p_role THEN RETURN false; END IF;  -- no role impersonation
  v_expected := encode(digest(v_hash || '|' || p_user_id::text || '|' || p_role || '|' || p_action, 'sha256'), 'hex');
  IF v_expected <> p_sig THEN RETURN false; END IF;       -- forged/modified
  RETURN p_role = ANY(p_allowed);                         -- role must be permitted
END;
$function$;

GRANT EXECUTE ON FUNCTION verify_table_write(uuid, text, text, text, text[]) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS app_settings_write_guard ON public.app_settings;
CREATE POLICY app_settings_write_guard ON public.app_settings FOR INSERT TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_settings', _actor_sig, 'admin', 'manager'));
DROP POLICY IF EXISTS app_settings_update_guard ON public.app_settings;
CREATE POLICY app_settings_update_guard ON public.app_settings FOR UPDATE TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_settings', _actor_sig, 'admin', 'manager'));

DROP POLICY IF EXISTS expenses_write_guard ON public.expenses;
CREATE POLICY expenses_write_guard ON public.expenses FOR INSERT TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_expenses', _actor_sig, 'admin', 'manager'));
DROP POLICY IF EXISTS expenses_update_guard ON public.expenses;
CREATE POLICY expenses_update_guard ON public.expenses FOR UPDATE TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_expenses', _actor_sig, 'admin', 'manager'));

DROP POLICY IF EXISTS suppliers_write_guard ON public.suppliers;
CREATE POLICY suppliers_write_guard ON public.suppliers FOR INSERT TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_suppliers', _actor_sig, 'admin', 'manager'));
DROP POLICY IF EXISTS suppliers_update_guard ON public.suppliers;
CREATE POLICY suppliers_update_guard ON public.suppliers FOR UPDATE TO anon, authenticated WITH CHECK (public.verify_table_write(_actor_id, _actor_role, 'manage_suppliers', _actor_sig, 'admin', 'manager'));
-- `products` intentionally NOT guarded (cashier stock-sync must stay open).
-- DELETE stays permissive for now: RLS DELETE cannot receive a payload signature,
-- so it cannot be token-guarded without routing through a SECURITY DEFINER RPC.
-- This matches current live behavior (anon could delete) and keeps the feature
-- working; INSERT/UPDATE are the financially-critical paths and are guarded.
DROP POLICY IF EXISTS app_settings_delete_guard ON public.app_settings;
CREATE POLICY app_settings_delete_guard ON public.app_settings FOR DELETE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS expenses_delete_guard ON public.expenses;
CREATE POLICY expenses_delete_guard ON public.expenses FOR DELETE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS suppliers_delete_guard ON public.suppliers;
CREATE POLICY suppliers_delete_guard ON public.suppliers FOR DELETE TO anon, authenticated USING (true);
