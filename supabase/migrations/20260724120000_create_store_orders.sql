-- ═══════════════════════════════════════════════════════════════════
-- Migration: Create store_orders table (separate from sales)
-- Date: 2026-07-24
-- 
-- Purpose: E-store orders are now stored in their own dedicated
-- table instead of being mixed with POS sales in the `sales` table.
-- This prevents inventory/revenue double-counting and keeps the
-- two channels fully independent.
-- 
-- Schema Change Log Entry:
--   - New table: store_orders (dedicated table for online store orders)
--   - Removes dependency on sales.estore_status, sales.sale_type='estore'
--   - store_orders.fulfilled_sale_id references sales(id) when order is fulfilled
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. CREATE STORE_ORDERS TABLE ──
CREATE TABLE IF NOT EXISTS store_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number      TEXT NOT NULL,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name       TEXT,
    customer_phone      TEXT,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(12,2) DEFAULT 0,
    tax_amount          DECIMAL(12,2) DEFAULT 0,
    total               DECIMAL(12,2) NOT NULL,
    delivery_fee        DECIMAL(12,2) DEFAULT 0,
    payment_method      TEXT DEFAULT 'cash',
    status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
    delivery_address    TEXT,
    delivery_location_lat NUMERIC,
    delivery_location_lng NUMERIC,
    customer_notes      TEXT,
    cashier             TEXT DEFAULT 'ONLINE_STORE',
    fulfilled_sale_id   UUID REFERENCES sales(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE store_orders REPLICA IDENTITY FULL;

-- ── 2. CREATE INDEXES ──
CREATE INDEX IF NOT EXISTS idx_store_orders_invoice_number ON store_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_fulfilled_sale_id ON store_orders(fulfilled_sale_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer_id ON store_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_created_at ON store_orders(created_at DESC);

-- ── 3. MIGRATE EXISTING ESTORE RECORDS FROM sales TO store_orders ──
-- Only migrate records that haven't already been fulfilled/deleted
INSERT INTO store_orders (
    id, invoice_number, customer_id, customer_name, customer_phone,
    items, subtotal, discount_amount, tax_amount, total,
    delivery_fee, payment_method, status, delivery_address,
    delivery_location_lat, delivery_location_lng, customer_notes,
    cashier, created_at, updated_at
)
SELECT
    id, invoice_number, customer_id, customer_name, customer_phone,
    items, subtotal, discount_amount, tax_amount, total,
    COALESCE(delivery_fee, 0), payment_method,
    COALESCE(estore_status, 'pending'), delivery_address,
    delivery_location_lat, delivery_location_lng, customer_notes,
    COALESCE(cashier, 'ONLINE_STORE'), created_at, updated_at
FROM sales
WHERE sale_type = 'estore'
  AND status != 'deleted'
  AND id NOT IN (
    -- Skip records that already have a fulfilled sale reference
    SELECT fulfilled_sale_id FROM store_orders WHERE fulfilled_sale_id IS NOT NULL
);

-- ── 4. MARK MIGRATED ESTORE SALES AS DELETED IN SALES TABLE ──
-- We soft-delete them to prevent double-counting in revenue reports
UPDATE sales
SET status = 'deleted',
    notes = COALESCE(notes || ' ', '') || '[MIGRATED TO store_orders]',
    updated_at = now()
WHERE sale_type = 'estore'
  AND status != 'deleted'
  AND id IN (SELECT id FROM store_orders);
