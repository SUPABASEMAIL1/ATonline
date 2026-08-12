-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Inventory Sync Trigger
-- Ensures 10-year auditability by mathematically adjusting product stock
-- whenever a stock_history delta is appended.
-- ════════════════════════════════════════════════════════════════

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION trigger_update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the main product stock
    UPDATE products SET 
        stock = COALESCE(stock, 0) + NEW.change_qty,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach the trigger to stock_history
DROP TRIGGER IF EXISTS on_stock_history_insert ON stock_history;
CREATE TRIGGER on_stock_history_insert
AFTER INSERT ON stock_history
FOR EACH ROW EXECUTE FUNCTION trigger_update_product_stock();

-- 3. Create the variant stock trigger function
CREATE OR REPLACE FUNCTION trigger_update_variant_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the variant stock inside the JSONB variant_data array
    -- This relies on the fact that variant_data is an array of objects
    -- We update the specific object where id = NEW.variant_id
    UPDATE products
    SET 
        variant_data = (
            SELECT jsonb_agg(
                CASE 
                    WHEN v->>'id' = NEW.variant_id::text THEN 
                        v || jsonb_build_object('stock', COALESCE((v->>'stock')::int, 0) + NEW.change_qty)
                    ELSE v 
                END
            )
            FROM jsonb_array_elements(variant_data) AS v
        ),
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the trigger to variant_stock_history
DROP TRIGGER IF EXISTS on_variant_stock_history_insert ON variant_stock_history;
CREATE TRIGGER on_variant_stock_history_insert
AFTER INSERT ON variant_stock_history
FOR EACH ROW EXECUTE FUNCTION trigger_update_variant_stock();

-- 5. Restore Reconcile Tool (F11 Rule)
-- This replaces the deprecated product_batches reconcile tool with a stock_history sum comparison.
CREATE OR REPLACE FUNCTION audit_stock_integrity_history()
RETURNS TABLE(product_id uuid, name text, stock integer, history_sum bigint, diff bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    p.id, 
    p.name, 
    p.stock,
    COALESCE(SUM(sh.change_qty), 0) AS history_sum,
    p.stock::bigint - COALESCE(SUM(sh.change_qty), 0) AS diff
  FROM products p
  LEFT JOIN stock_history sh ON sh.product_id = p.id
  WHERE p.track_inventory = true
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(sh.change_qty), 0)
  ORDER BY ABS(p.stock - COALESCE(SUM(sh.change_qty), 0)) DESC;
$$;

GRANT EXECUTE ON FUNCTION audit_stock_integrity_history() TO anon, authenticated;
