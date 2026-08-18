-- 20260818150000_sales_created_at_index.sql
-- sync fix: sales full pulls (order by created_at desc) were timing out
-- (PostgREST statement_timeout, 57014) on the 45MB sales table because no
-- plain index on created_at existed for the sort.
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales (created_at DESC);