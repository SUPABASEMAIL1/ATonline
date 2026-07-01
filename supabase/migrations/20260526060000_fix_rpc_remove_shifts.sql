-- Migration: Fix RPC functions and drop remaining index leftovers for shift removal
-- Created at: 2026-05-26

-- 1. Drop shift indexes if they still exist
DROP INDEX IF EXISTS idx_sales_shift_id;
DROP INDEX IF EXISTS idx_expenses_shift_id;

-- 2. Drop audit_shift_cash function if it still exists
DROP FUNCTION IF EXISTS audit_shift_cash(uuid);

-- 3. Recreate create_sale function without shift_id
CREATE OR REPLACE FUNCTION create_sale(sale_data JSONB)
RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
    new_sale_id UUID;
BEGIN
    INSERT INTO sales (
        id, workspace_id, invoice_number, customer_id, customer_name, customer_phone,
        items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
        tax_amount, total, received_amount, change_amount, payment_method,
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at
    ) VALUES (
        (sale_data->>'id')::UUID,
        (sale_data->>'workspace_id')::UUID,
        sale_data->>'invoice_number',
        (sale_data->>'customer_id')::UUID,
        sale_data->>'customer_name',
        sale_data->>'customer_phone',
        (sale_data->'items')::JSONB,
        (sale_data->>'subtotal')::DECIMAL,
        (sale_data->>'discount_amount')::DECIMAL,
        (sale_data->>'bill_discount_value')::DECIMAL,
        sale_data->>'bill_discount_type',
        (sale_data->>'tax_amount')::DECIMAL,
        (sale_data->>'total')::DECIMAL,
        (sale_data->>'received_amount')::DECIMAL,
        (sale_data->>'change_amount')::DECIMAL,
        sale_data->>'payment_method',
        COALESCE(sale_data->>'status', 'completed'),
        sale_data->>'cashier',
        sale_data->>'cashier_role',
        sale_data->>'notes',
        COALESCE(sale_data->>'sale_type', 'retail'),
        COALESCE((sale_data->>'timestamp')::TIMESTAMPTZ, NOW()),
        NOW(),
        NOW()
    ) RETURNING id INTO new_sale_id;

    RETURN jsonb_build_object('success', true, 'id', new_sale_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate process_sale function without shift_id
CREATE OR REPLACE FUNCTION process_sale(sale_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_sale_id UUID;
BEGIN
    INSERT INTO sales (
        id, workspace_id, invoice_number, customer_id, customer_name, customer_phone,
        items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
        tax_amount, total, received_amount, change_amount, payment_method,
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at
    ) VALUES (
        (sale_data->>'id')::UUID, (sale_data->>'workspace_id')::UUID,
        sale_data->>'invoice_number', (sale_data->>'customer_id')::UUID,
        sale_data->>'customer_name', sale_data->>'customer_phone',
        (sale_data->'items')::JSONB, (sale_data->>'subtotal')::DECIMAL,
        (sale_data->>'discount_amount')::DECIMAL, (sale_data->>'bill_discount_value')::DECIMAL,
        sale_data->>'bill_discount_type', (sale_data->>'tax_amount')::DECIMAL,
        (sale_data->>'total')::DECIMAL, (sale_data->>'received_amount')::DECIMAL,
        (sale_data->>'change_amount')::DECIMAL, sale_data->>'payment_method',
        COALESCE(sale_data->>'status', 'completed'), sale_data->>'cashier',
        sale_data->>'cashier_role', sale_data->>'notes',
        COALESCE(sale_data->>'sale_type', 'retail'),
        COALESCE((sale_data->>'timestamp')::TIMESTAMPTZ, NOW()), NOW(), NOW()
    ) RETURNING id INTO new_sale_id;
    RETURN jsonb_build_object('success', true, 'id', new_sale_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;
