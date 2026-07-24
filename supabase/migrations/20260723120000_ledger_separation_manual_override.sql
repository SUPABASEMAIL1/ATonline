-- Migration: Add sourceType, isManualOverride, overrideBy columns to supplier_transactions
-- Also adds isManualOverride, overrideBy to expenses and payments tables
-- Date: 2026-07-23
-- Purpose: Ledger separation (auto-purchase vs manual bill) + Manual Override Mode audit trail

-- Supplier Transactions
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual_bill';
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS override_by TEXT;

-- Expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS override_by TEXT;

-- Payments (customer_payments or payments table)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS override_by TEXT;

-- Sales (for soft-delete support)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill: tag existing purchase entries as auto_purchase
UPDATE supplier_transactions 
SET source_type = 'auto_purchase' 
WHERE type = 'purchase' AND source_type IS NULL AND note LIKE 'Stock In:%';

UPDATE supplier_transactions 
SET source_type = 'auto_purchase' 
WHERE type = 'purchase' AND source_type IS NULL AND note LIKE 'PO Stock In:%';

UPDATE supplier_transactions 
SET source_type = 'opening_balance' 
WHERE type = 'opening_balance' AND source_type IS NULL;

UPDATE supplier_transactions 
SET source_type = 'payment' 
WHERE type = 'payment' AND source_type IS NULL;
