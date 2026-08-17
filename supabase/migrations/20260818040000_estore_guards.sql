-- ============================================================================
-- estore_guards (MASTER §9 — production hardening)
-- 1. Server-side ORDER STATE MACHINE: invalid store_orders status transitions
--    are rejected by the database, never trusting UI-disabled buttons.
-- 2. Per-phone RATE LIMIT on order placement: prevents queue-flooding from a
--    single number (stock is never at risk, but the /orders queue stays clean).
-- Both are additive, idempotent, and safe to re-apply.
-- ============================================================================

-- Transition validator: returns true only for legal transitions.
CREATE OR REPLACE FUNCTION store_order_transition_is_valid(old_s text, new_s text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  allowed text[];
BEGIN
  IF old_s IS NULL OR old_s = new_s THEN RETURN true; END IF;
  CASE old_s
    WHEN 'pending'         THEN allowed := ARRAY['accepted', 'cancelled', 'converted'];
    WHEN 'accepted'        THEN allowed := ARRAY['preparing', 'cancelled', 'converted'];
    WHEN 'preparing'       THEN allowed := ARRAY['ready', 'cancelled', 'converted'];
    WHEN 'ready'           THEN allowed := ARRAY['out_for_delivery', 'cancelled', 'converted'];
    WHEN 'out_for_delivery' THEN allowed := ARRAY['delivered', 'cancelled', 'converted'];
    WHEN 'delivered'       THEN allowed := ARRAY[]::text[];
    WHEN 'cancelled'       THEN allowed := ARRAY[]::text[];
    WHEN 'converted'       THEN allowed := ARRAY[]::text[];
    ELSE RETURN false;
  END CASE;
  RETURN new_s = ANY(allowed);
END;
$$;

CREATE OR REPLACE FUNCTION guard_store_order_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT store_order_transition_is_valid(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: store_order % cannot go % -> %', OLD.id, OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_store_order_update ON store_orders;
CREATE TRIGGER trg_guard_store_order_update
BEFORE UPDATE ON store_orders
FOR EACH ROW EXECUTE FUNCTION guard_store_order_update();

-- Per-phone rate limit (anti flood). Tunable constant below (20 orders / 10 min).
CREATE OR REPLACE FUNCTION guard_store_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  cnt integer;
BEGIN
  IF NEW.customer_phone IS NOT NULL AND NEW.customer_phone <> '' THEN
    SELECT count(*) INTO cnt FROM store_orders
      WHERE customer_phone = NEW.customer_phone
        AND created_at > now() - interval '10 minutes';
    IF cnt >= 20 THEN
      RAISE EXCEPTION 'RATE_LIMIT: too many recent orders from this phone' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_store_order_insert ON store_orders;
CREATE TRIGGER trg_guard_store_order_insert
BEFORE INSERT ON store_orders
FOR EACH ROW EXECUTE FUNCTION guard_store_order_insert();
