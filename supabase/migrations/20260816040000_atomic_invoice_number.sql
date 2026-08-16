-- ============================================================================
-- Atomic invoice number generation (2026-08-16) — fixes M12
-- get_next_invoice_number now uses a single UPDATE...RETURNING so concurrent
-- callers can NEVER receive the same invoice number (was a SELECT-then-UPDATE
-- race). Replaces the prior loop-based version.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    counter INTEGER;
    new_invoice_number TEXT;
BEGIN
    UPDATE app_settings
    SET invoice_counter = COALESCE(invoice_counter, 1000) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = '00000000-0000-4000-8000-000000000001'
    RETURNING invoice_counter, invoice_prefix
    INTO counter, prefix;

    IF prefix IS NULL THEN prefix := 'INV'; END IF;
    new_invoice_number := prefix || '-' || LPAD(counter::TEXT, 6, '0');
    RETURN new_invoice_number;
END;
$$ LANGUAGE plpgsql;
