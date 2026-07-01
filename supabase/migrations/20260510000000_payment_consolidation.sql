-- Consolidation of payment methods to 'digital'
-- Date: 2026-05-10
-- Description: Maps legacy payment types (jazzcash, easypaisa, bank_transfer) to unified 'digital' status.

-- 1. Update existing sales (if any split payments used these strings in JSON)
-- Note: split_payments is JSONB, we'll need to transform it if it contains these strings.
-- For now, let's update the main payment_method just in case.
UPDATE sales 
SET payment_method = 'digital' 
WHERE payment_method IN ('bank_transfer', 'jazzcash', 'easypaisa');

-- 2. Update expenses
UPDATE expenses 
SET payment_method = 'digital' 
WHERE payment_method IN ('bank_transfer', 'jazzcash', 'easypaisa');

-- 3. Update payments
UPDATE payments 
SET payment_type = 'digital' 
WHERE payment_type IN ('bank_transfer', 'jazzcash', 'easypaisa');

-- 4. Drop and recreate constraints to enforce the new restricted list
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_payment_method_check CHECK (payment_method IN ('cash', 'card', 'digital'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('cash', 'card', 'digital'));

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check CHECK (payment_method IN ('cash', 'card', 'digital', 'credit', 'cheque'));
