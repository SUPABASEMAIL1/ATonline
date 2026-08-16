-- ============================================================================
-- Roles normalization (2026-08-16) — completes M16
-- The app has NO operational RBAC: every authenticated user is a cashier/salesman.
-- The users table CHECK already restricts role to ('cashier','salesman') and the
-- handle_new_user trigger already coerces to 'cashier'. This migration cleans up
-- any pre-existing 'admin'/'manager' rows so they conform to the new constraint.
-- ============================================================================

-- Normalize legacy roles down to the two supported values.
UPDATE public.users
SET role = 'cashier'
WHERE role IS NULL
   OR role NOT IN ('cashier', 'salesman');

-- Drop the obsolete is_admin() helper if it still exists (no longer used).
DROP FUNCTION IF EXISTS is_admin() CASCADE;
