-- ============================================================================
-- roles_reexpand (MASTER §2.1.1 / §2.1.4)
-- Prior migrations narrowed the role system to (cashier, salesman) as a
-- single-tenant simplification. Production requires real authorization, so we
-- restore the full 4-role set and add a server-side role helper.
-- Safe / idempotent: unknown rows coerce to cashier (fail-closed).
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'cashier', 'salesman'));

UPDATE public.users SET role = 'cashier'
WHERE role IS NULL OR role NOT IN ('admin', 'manager', 'cashier', 'salesman');

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$;


