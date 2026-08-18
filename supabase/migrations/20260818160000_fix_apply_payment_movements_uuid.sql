-- 20260818160000_fix_apply_payment_movements_uuid.sql
-- BUG (jeanzone, 2026-08-18): apply_payment_movements used uuid_generate_v4()
-- but the function's SET search_path = 'public' hides the uuid-ossp schema,
-- so uuid_generate_v4() was "not found". Every real payment movement -> 404
-- (masked SQLSTATE 42883) -> adjustPaymentBalances threw -> sale deletes
-- aborted before localDb.sales.delete() -> sales re-appeared after pull.
-- apply_stock_movements already used gen_random_uuid() (built-in, always
-- visible) and worked. Fix: switch to gen_random_uuid().
CREATE OR REPLACE FUNCTION apply_payment_movements(p_moves jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
  _role text;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN: payment movements require cashier or higher' USING ERRCODE = '42501';
  END IF;
  FOR h IN SELECT * FROM jsonb_array_elements(p_moves)
  LOOP
    INSERT INTO payment_movements (id, mode_id, delta, reference_id, note, created_at)
    VALUES (
      COALESCE((h->>'id')::uuid, gen_random_uuid()),
      h->>'mode_id',
      (h->>'delta')::numeric,
      NULLIF(h->>'reference_id','')::uuid,
      h->>'note',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN
      UPDATE payment_modes SET balance = balance + (h->>'delta')::numeric, updated_at = now()
      WHERE id = h->>'mode_id';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$function$;
