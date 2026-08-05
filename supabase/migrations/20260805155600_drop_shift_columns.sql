-- Migration: Drop shift columns and legacy tables

-- Drop foreign keys if they exist
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_shift_id_fkey;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_shift_id_fkey;

-- Drop columns
ALTER TABLE sales DROP COLUMN IF EXISTS shift_id;
ALTER TABLE sales DROP COLUMN IF EXISTS refund_shift_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS shift_id;

-- Drop legacy shift tables if they still exist
DROP TABLE IF EXISTS shift_denominations;
DROP TABLE IF EXISTS shifts;
