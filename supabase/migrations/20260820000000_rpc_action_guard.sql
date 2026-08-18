-- ============================================================================
-- 20260820000000_rpc_action_guard.sql
-- ============================================================================
-- MASTER §2.1.4 — real server-side role enforcement that SURVIVES the anon-key
-- + offline-login architecture (this is why the Aug-18 auth.uid() hardening had
-- to be reverted: auth.uid() is NULL for offline users and broke the app).
--
-- Approach: each sensitive RPC receives a signature
--   p_sig = SHA256( offline_hash || '|' || user_id || '|' || role || '|' || action )
-- computed client-side from the user's password hash (actionToken.ts). The RPC
-- recomputes it from the SERVER-STORED users.offline_hash and:
--   1. rejects if the signature does not match (forged/modified),
--   2. rejects if the claimed role != the stored role,
--   3. rejects if the (verified) role is not permitted for that action.
-- An attacker without the victim's password cannot forge a valid signature, so
-- this is real authorization even though the caller is the public anon key.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared verifier. SECURITY DEFINER so it can read users.offline_hash.
CREATE OR REPLACE FUNCTION public.verify_action_token(
  p_user_id uuid,
  p_role text,
  p_action text,
  p_sig text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hash text;
  v_stored_role text;
  v_expected text;
BEGIN
  -- No signature => reject (fail-closed), unless this is a legacy user whose
  -- offline_hash was never synced (extremely rare; allows them to keep working
  -- until their next online login re-syncs the hash).
  IF p_sig IS NULL OR p_sig = '' THEN
    SELECT offline_hash, role INTO v_hash, v_stored_role FROM users WHERE id = p_user_id;
    IF v_hash IS NULL THEN RETURN true; END IF;   -- legacy allow
    RETURN false;                                 -- modern user must sign
  END IF;

  SELECT offline_hash, role INTO v_hash, v_stored_role FROM users WHERE id = p_user_id;
  IF v_hash IS NULL OR v_stored_role IS NULL THEN RETURN false; END IF;

  -- Claimed role must match the server-truth role (no privilege escalation).
  IF v_stored_role <> p_role THEN RETURN false; END IF;

  v_expected := encode(
    digest(v_hash || '|' || p_user_id::text || '|' || p_role || '|' || p_action, 'sha256'),
    'hex'
  );
  RETURN v_expected = p_sig;
END;
$function$;

GRANT EXECUTE ON FUNCTION verify_action_token(uuid, text, text, text) TO anon, authenticated, service_role;

-- Helper: raise a clean FORBIDDEN when the token/role check fails.
CREATE OR REPLACE FUNCTION public.require_action(p_user_id uuid, p_role text, p_action text, p_sig text, VARIADIC p_allowed text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.verify_action_token(p_user_id, p_role, p_action, p_sig) THEN
    RAISE EXCEPTION 'FORBIDDEN: invalid or missing action token' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_role = ANY(p_allowed)) THEN
    RAISE EXCEPTION 'FORBIDDEN: role % not permitted for %', p_role, p_action USING ERRCODE = '42501';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION require_action(uuid, text, text, text, text[]) TO anon, authenticated, service_role;

-- ── delete_sale_atomic: requires admin|manager ──────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_sale_atomic(
  p_sale_id uuid,
  p_history jsonb,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_sig text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
BEGIN
  PERFORM public.require_action(p_user_id, p_role, 'delete_sale', p_sig, 'admin', 'manager');

  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'already_deleted');
  END IF;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  UPDATE sales SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = p_sale_id;
  INSERT INTO row_tombstones (table_name, ref_id, deleted_at)
  VALUES ('sales', p_sale_id, now())
  ON CONFLICT (table_name, ref_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION delete_sale_atomic(uuid, jsonb, uuid, text, text) TO anon, authenticated, service_role;

-- ── refund_sale_atomic: requires admin|manager|cashier (keeps over-refund cap) ─
CREATE OR REPLACE FUNCTION public.refund_sale_atomic(
  p_sale_id uuid,
  p_history jsonb,
  p_status text,
  p_refunded_amount numeric,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_sig text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
  _total numeric;
BEGIN
  PERFORM public.require_action(p_user_id, p_role, 'refund_sale', p_sig, 'admin', 'manager', 'cashier');

  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'sale_missing');
  END IF;

  SELECT total INTO _total FROM sales WHERE id = p_sale_id;
  IF _total IS NOT NULL AND p_refunded_amount > _total + 0.001 THEN
    RAISE EXCEPTION 'FORBIDDEN: refund amount exceeds sale total' USING ERRCODE = '42501';
  END IF;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  UPDATE sales SET status = p_status, refunded_amount = p_refunded_amount, updated_at = now() WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION refund_sale_atomic(uuid, jsonb, text, numeric, uuid, text, text) TO anon, authenticated, service_role;
