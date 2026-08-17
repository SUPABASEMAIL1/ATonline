-- ============================================================================
-- rpc_role_guards (MASTER §2.1.4 / §2.1.5)
-- These RPCs are SECURITY DEFINER; auth.uid() still reflects the calling user.
--   delete_sale_atomic : admin | manager only
--   refund_sale_atomic : admin | manager | cashier  (salesman excluded)
-- Idempotency (ON CONFLICT DO NOTHING, EXISTS guards) is preserved.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_sale_atomic(p_sale_id uuid, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
  _role text;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NULL OR _role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN: delete_sale requires admin or manager' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
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

  DELETE FROM sales WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END; $$;

CREATE OR REPLACE FUNCTION refund_sale_atomic(p_sale_id uuid, p_history jsonb, p_status text, p_refunded_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
  _role text;
  _total numeric;
BEGIN
  SELECT role INTO _role FROM public.users WHERE id = auth.uid();
  IF _role IS NULL OR _role NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'FORBIDDEN: refund requires cashier or higher' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'sale_missing');
  END IF;

  -- Universal over-refund guard (MASTER §2.1.5 / §7 I5): no role may refund more
  -- than the original sale total. p_refunded_amount is the NEW cumulative total.
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
END; $$;

GRANT EXECUTE ON FUNCTION delete_sale_atomic(uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refund_sale_atomic(uuid, jsonb, text, numeric) TO anon, authenticated, service_role;
