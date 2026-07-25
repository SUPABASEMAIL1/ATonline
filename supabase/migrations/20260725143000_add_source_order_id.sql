-- Add source_order_id to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES store_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_source_order_id ON sales(source_order_id);

-- Update store_orders status constraint to include 'converted'
ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_status_check;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_status_check CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'converted'));
