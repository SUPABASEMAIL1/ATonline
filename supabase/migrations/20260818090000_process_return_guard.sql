-- ============================================================================
-- process_return_guard (MASTER §2.1.4 + §7 I5)
-- The offline/sync refund path (syncEngine.ts) calls process_return, which
-- previously had NO server-side role check and NO over-refund guard. Now:
--   * role must be admin | manager | cashier (salesman blocked). A NULL role
--     (user not yet provisioned in public.users) is allowed to avoid breaking
--     legitimate refunds for edge accounts.
--   * Over-refund is blocked by the DB CHECK chk_sales_refund_not_exceed_total
--     (added in 20260818070000_i5_refund_check.sql) — the UPDATE raises and is
--     caught, returning success:false.
-- Applied live 2026-08-17.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_return(sale_id uuid, return_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT;
    v_refunded_amount DECIMAL(12,2);
    _role text;
BEGIN
    SELECT role INTO _role FROM public.users WHERE id = auth.uid();
    IF _role IS NOT NULL AND _role NOT IN ('admin', 'manager', 'cashier') THEN
      RAISE EXCEPTION 'FORBIDDEN: return requires cashier or higher' USING ERRCODE = '42501';
    END IF;
    v_status := COALESCE(return_data->>'status', 'refunded');
    v_refunded_amount := COALESCE((return_data->>'refundedAmount')::DECIMAL(12,2), 0);
    UPDATE sales SET
        status = v_status,
        refunded_amount = COALESCE(refunded_amount, 0) + v_refunded_amount,
        items = COALESCE(return_data->>'items', items::TEXT)::JSONB,
        notes = COALESCE(notes, '') || E'\n[RETURNED] ' || COALESCE(return_data->>'notes', ''),
        updated_at = NOW()
    WHERE id = sale_id;
    RETURN jsonb_build_object('success', true, 'id', sale_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;
