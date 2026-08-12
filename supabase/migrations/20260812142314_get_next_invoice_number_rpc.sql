-- ============================================================
-- 20260812142314_get_next_invoice_number_rpc.sql
-- Adds the missing get_next_invoice_number() RPC.
-- syncEngine.ts calls this RPC when an invoice collision (23505)
-- is detected so the retry path actually works (previously the
-- RPC did not exist → retries always failed → sale never synced).
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    counter INTEGER;
    new_invoice_number TEXT;
BEGIN
    SELECT invoice_prefix, invoice_counter
    INTO prefix, counter
    FROM app_settings LIMIT 1;

    IF prefix IS NULL THEN prefix := 'INV'; END IF;
    IF counter IS NULL THEN counter := 1000; END IF;

    new_invoice_number := prefix || '-' || LPAD(counter::TEXT, 6, '0');

    UPDATE app_settings
    SET invoice_counter = counter + 1,
        updated_at = timezone('utc'::text, now());

    RETURN new_invoice_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;