-- ============================================================================
-- Role model narrowing (2026-08-16)
-- Universal 2-role system: cashier + salesman. Operational gating is removed
-- app-side; the DB must stop creating/persisting legacy admin/manager roles.
-- Safe: migrate legacy rows first, then tighten the CHECK constraint.
-- ============================================================================

-- 1. Migrate any legacy admin/manager rows to 'cashier' (no functional gating relies on role)
UPDATE users SET role = 'cashier' WHERE role NOT IN ('cashier', 'salesman');

-- 2. Drop old 3-role CHECK and add the 2-role CHECK
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('cashier', 'salesman'));

-- 3. First user is no longer auto-promoted to admin
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    is_first_user BOOLEAN;
    _role TEXT;
    base_username TEXT;
    final_username TEXT;
    suffix INT := 0;
BEGIN
    SELECT NOT EXISTS (SELECT 1 FROM public.users) INTO is_first_user;

    -- Universal default role: cashier (never admin/manager)
    _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'cashier');
    IF _role NOT IN ('cashier', 'salesman') THEN
        _role := 'cashier';
    END IF;

    base_username := COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1));
    final_username := base_username;

    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = final_username) LOOP
        suffix := suffix + 1;
        final_username := base_username || suffix::TEXT;
    END LOOP;

    INSERT INTO public.users (
        id, username, name, email, role, active
    )
    VALUES (
        NEW.id,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.email,
        _role,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
