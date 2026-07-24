-- Allow 'deleted' and 'cancelled' in sales status
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'credit', 'draft', 'deleted', 'cancelled'));
