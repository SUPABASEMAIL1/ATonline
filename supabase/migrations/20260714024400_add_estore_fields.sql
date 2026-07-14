-- Migration: Add E-Store fields
-- Description: Adds show_in_estore to products and estore status/delivery fields to sales.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_in_estore BOOLEAN DEFAULT true;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS estore_status TEXT DEFAULT 'pending' CHECK (estore_status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_notes TEXT;
