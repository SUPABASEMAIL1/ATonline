export const MASTER_SCHEMA = `
-- ================================================================
-- ZAYNAH'S POS v2 — COMPLETE SUPABASE SCHEMA
-- ================================================================
-- Description : Drop-in SQL for a FRESH Supabase project.
--               Creates every table, column, constraint, index,
--               RLS policy, trigger, function, view, and seed data.
--
-- Tables (18) :
--   1.  app_settings          (Singleton config)
--   2.  categories             (Product taxonomy)
--   3.  customers              (CRM / Loyalty)
--   4.  suppliers              (Vendor management)
--   5.  products               (Inventory master)
--   6.  product_batches        (FIFO batch tracking)
--   7.  discounts              (Campaigns / BOGO)
--   8.  users                  (Extends auth.users)
--   9.  sales                  (Invoices / POS)
--  10.  sales_tabs             (Multi-tab cashier)
--  11.  expenses               (Operating costs)
--  12.  purchase_records       (Unified ledger)
--  13.  purchase_orders        (PO headers)
--  14.  purchase_order_items   (PO line items)
--  15.  supplier_transactions  (Khata / Ledger)
--  16.  payments               (Supplier payments)
--  17.  stock_history          (Inventory audit log)
--  18.  shifts                 (Shift management)
--  19.  shift_denominations    (Cash counting)
--
-- Views (2) :
--   • shift_summary
--   • daily_summary
--
-- Run once on Supabase SQL Editor → "New Query" → Paste → Run.
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- 0. EXTENSIONS
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════════
-- 1. APP SETTINGS  (Singleton — 1 row only)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Store Identity
    store_name                  TEXT DEFAULT 'Zaynahs',
    store_address               TEXT,
    store_phone                 TEXT,
    store_email                 TEXT,
    store_logo                  TEXT,
    store_website               TEXT,

    -- Finance
    tax_rate                    DECIMAL(5,4) DEFAULT 0.0000,
    currency                    TEXT DEFAULT 'PKR',

    -- UI
    interface_mode              TEXT DEFAULT 'touch' CHECK (interface_mode IN ('touch', 'traditional')),
    theme                       TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'auto')),

    -- General Toggles
    auto_backup                 BOOLEAN DEFAULT true,
    receipt_printer             BOOLEAN DEFAULT false,

    -- Invoice Numbering
    invoice_prefix              TEXT DEFAULT 'INV',
    invoice_counter             INTEGER DEFAULT 1000,
    custom_receipt_number       BOOLEAN DEFAULT false,

    -- Receipt Display
    receipt_paper_size          TEXT DEFAULT '80mm',
    receipt_density             TEXT DEFAULT 'normal',
    receipt_header              TEXT,
    receipt_footer              TEXT,
    receipt_show_logo           BOOLEAN DEFAULT true,
    receipt_show_footer         BOOLEAN DEFAULT true,
    receipt_show_tax            BOOLEAN DEFAULT true,
    receipt_show_discount       BOOLEAN DEFAULT true,
    receipt_show_store_name     BOOLEAN DEFAULT true,
    receipt_show_store_address  BOOLEAN DEFAULT true,
    receipt_show_store_phone    BOOLEAN DEFAULT true,
    receipt_show_store_email    BOOLEAN DEFAULT true,
    receipt_show_customer_name  BOOLEAN DEFAULT true,
    receipt_show_customer_phone BOOLEAN DEFAULT true,
    receipt_show_notes          BOOLEAN DEFAULT true,
    receipt_show_delivery_address BOOLEAN DEFAULT true,
    receipt_show_qr_code        BOOLEAN DEFAULT true,
    receipt_template            TEXT DEFAULT 'modern',
    receipt_font_scale          DECIMAL(3,2) DEFAULT 1.00,
    receipt_font_bold           BOOLEAN DEFAULT false,
    receipt_font_weight         INTEGER,

    -- Receipt Position Adjustments
    receipt_padding_top         INTEGER DEFAULT 0,
    receipt_padding_bottom      INTEGER DEFAULT 0,
    receipt_padding_left        INTEGER DEFAULT 0,
    receipt_padding_right       INTEGER DEFAULT 0,
    receipt_offset_x            INTEGER DEFAULT 0,
    receipt_header_offset_x     INTEGER,
    receipt_footer_offset_x     INTEGER,

    -- Barcode Label Settings
    barcode_paper_size          TEXT DEFAULT 'A4',
    barcode_a4_columns          INTEGER DEFAULT 3,
    barcode_a4_rows             INTEGER DEFAULT 10,
    barcode_show_price          BOOLEAN DEFAULT true,
    barcode_show_name           BOOLEAN DEFAULT true,
    barcode_show_sku            BOOLEAN DEFAULT false,
    barcode_show_category       BOOLEAN DEFAULT false,
    barcode_scale               DECIMAL(3,2) DEFAULT 1.50,
    barcode_height              INTEGER DEFAULT 40,
    barcode_padding             INTEGER DEFAULT 8,
    barcode_border              BOOLEAN DEFAULT true,

    -- Sync / Offline
    offline_mode                BOOLEAN DEFAULT true,
    auto_sync                   BOOLEAN DEFAULT true,

    -- Localization & Business
    country                     TEXT DEFAULT 'PK',
    tax_id                      TEXT,
    business_type               TEXT DEFAULT 'general',

    -- Purchase Order Config
    enable_purchase_orders      BOOLEAN DEFAULT true,
    po_prefix                   TEXT DEFAULT 'PO',
    po_counter                  INTEGER DEFAULT 1000,

    -- System Module Toggles (migration v3)
    shift_system_enabled        BOOLEAN DEFAULT false,
    retail_enabled              BOOLEAN DEFAULT true,
    wholesale_enabled           BOOLEAN DEFAULT false,
    estore_enabled              BOOLEAN DEFAULT false,
    touch_keyboard_enabled      BOOLEAN DEFAULT false,
    sound_enabled               BOOLEAN DEFAULT true,
    last_backup_date            TEXT,

    -- Timestamps
    created_at                  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 2. CATEGORIES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    active          BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 3. CUSTOMERS  (CRM + Credit)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT NOT NULL,
    email                   TEXT,
    phone                   TEXT,
    address                 TEXT,
    price_tier              TEXT DEFAULT 'retail',
    credit_limit            DECIMAL(10,2) DEFAULT 0.00,
    credit_used             DECIMAL(10,2) DEFAULT 0.00,
    total_purchases         DECIMAL(12,2) DEFAULT 0.00,
    last_purchase           TIMESTAMPTZ,
    preferred_categories    JSONB DEFAULT '[]'::jsonb,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 4. SUPPLIERS  (Vendor + Opening Balance)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suppliers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    address             TEXT,
    business_type       TEXT DEFAULT 'General',
    payment_terms       TEXT,
    opening_balance     DECIMAL(12,2) DEFAULT 0.00,
    rating              DECIMAL(2,1) DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 5. PRODUCTS  (Inventory Master)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    sku                 TEXT NOT NULL UNIQUE,
    barcode             TEXT,
    price               DECIMAL(10,2) NOT NULL,
    cost                DECIMAL(10,2),
    stock               INTEGER DEFAULT 0,
    min_stock           INTEGER DEFAULT 0,
    target_stock        INTEGER,
    category            TEXT NOT NULL,
    supplier            TEXT,
    description         TEXT,
    image               TEXT,
    taxable             BOOLEAN DEFAULT true,
    active              BOOLEAN DEFAULT true,
    is_weight_based     BOOLEAN DEFAULT false,
    price_per_unit      DECIMAL(10,2),
    unit                TEXT DEFAULT 'piece',
    track_inventory     BOOLEAN DEFAULT true,
    is_featured         BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT products_price_positive          CHECK (price >= 0),
    CONSTRAINT products_cost_positive           CHECK (cost >= 0),
    CONSTRAINT products_stock_non_negative      CHECK (stock >= 0),
    CONSTRAINT products_min_stock_non_negative   CHECK (min_stock >= 0)
);


-- ════════════════════════════════════════════════════════════════
-- 6. PRODUCT BATCHES  (FIFO / Expiry)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_batches (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID REFERENCES products(id) ON DELETE CASCADE,
    batch_number        TEXT NOT NULL,
    batch_type          TEXT DEFAULT 'purchase' CHECK (batch_type IN ('opening', 'purchase')),
    manufacturing_date  DATE,
    expiry_date         DATE,
    quantity            INTEGER NOT NULL DEFAULT 0,
    qty_remaining       INTEGER DEFAULT 0,
    cost_price          DECIMAL(10,2),
    sale_price          DECIMAL(10,2),
    supplier_id         UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name       TEXT,
    supplier_info       TEXT,
    po_id               UUID,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT product_batches_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT product_batches_cost_positive         CHECK (cost_price >= 0),
    CONSTRAINT unique_batch_per_product              UNIQUE (product_id, batch_number)
);


-- ════════════════════════════════════════════════════════════════
-- 7. DISCOUNTS  (Campaigns / BOGO / Free Gift)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS discounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    description         TEXT,
    type                TEXT NOT NULL CHECK (type IN ('percentage', 'fixed', 'bogo', 'free_gift')),
    value               DECIMAL(10,2) DEFAULT 0,
    conditions          JSONB DEFAULT '[]'::jsonb,
    free_gift_products  TEXT[],
    min_amount          DECIMAL(10,2),
    max_discount        DECIMAL(10,2),
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_to            TIMESTAMPTZ NOT NULL,
    valid_days          INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
    active              BOOLEAN DEFAULT true,
    is_auto_apply       BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT discounts_value_non_negative   CHECK (value >= 0),
    CONSTRAINT discounts_valid_date_range     CHECK (valid_to > valid_from),
    CONSTRAINT discounts_valid_days_range     CHECK (valid_days <@ ARRAY[0,1,2,3,4,5,6])
);


-- ════════════════════════════════════════════════════════════════
-- 8. USERS  (Extends Supabase auth.users)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username            TEXT NOT NULL,
    name                TEXT NOT NULL,
    email               TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier')),
    permissions         TEXT[] DEFAULT '{}',

    -- Granular ACL Booleans
    can_edit_price      BOOLEAN DEFAULT false,
    can_give_discount   BOOLEAN DEFAULT false,
    can_delete_sale     BOOLEAN DEFAULT false,
    can_view_profit     BOOLEAN DEFAULT false,
    can_manage_stock    BOOLEAN DEFAULT false,
    can_manage_po       BOOLEAN DEFAULT false,
    can_view_records    BOOLEAN DEFAULT false,

    active              BOOLEAN DEFAULT true,
    last_login          TIMESTAMPTZ,
    avatar              TEXT,
    offline_hash        TEXT,  -- bcrypt hash for offline auth

    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    UNIQUE(username)
);


-- ════════════════════════════════════════════════════════════════
-- 9. SHIFTS  (Shift Management) — MUST be before sales/expenses
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shifts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name           TEXT,
    start_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time            TIMESTAMPTZ,
    opening_cash        NUMERIC(12,2) DEFAULT 0,
    closing_cash_count  NUMERIC(12,2),
    expected_cash       NUMERIC(12,2),
    cash_difference     NUMERIC(12,2),
    status              TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'force_closed', 'auto_closed')),
    shift_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════
-- 10. SHIFT DENOMINATIONS  (Cash Counting)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shift_denominations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id        UUID REFERENCES shifts(id) ON DELETE CASCADE,
    denom_5000      INTEGER DEFAULT 0,
    denom_1000      INTEGER DEFAULT 0,
    denom_500       INTEGER DEFAULT 0,
    denom_100       INTEGER DEFAULT 0,
    denom_50        INTEGER DEFAULT 0,
    denom_20        INTEGER DEFAULT 0,
    denom_10        INTEGER DEFAULT 0,
    other_cash      NUMERIC(12,2) DEFAULT 0,
    total_cash      NUMERIC(12,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════
-- 11. SALES  (POS Invoices)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number      TEXT NOT NULL UNIQUE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name       TEXT,
    customer_phone      TEXT,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(12,2) DEFAULT 0,
    bill_discount_value DECIMAL(12,2),
    bill_discount_type  TEXT,
    tax_amount          DECIMAL(12,2) DEFAULT 0,
    total               DECIMAL(12,2) NOT NULL,
    received_amount     DECIMAL(12,2),
    change_amount       DECIMAL(12,2),
    payment_method      TEXT CHECK (payment_method IN ('cash', 'card', 'digital', 'credit', 'cheque')),
    card_details        JSONB,
    status              TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'credit', 'draft')),
    cashier             TEXT,
    cashier_role        TEXT,
    receipt_number      TEXT,
    notes               TEXT,
    applied_discounts   JSONB DEFAULT '[]'::jsonb,
    free_gifts          JSONB DEFAULT '[]'::jsonb,
    timestamp           TIMESTAMPTZ DEFAULT NOW(),

    -- Shift & Sale Type (migration v3)
    shift_id            UUID REFERENCES shifts(id) ON DELETE SET NULL,
    sale_date           DATE DEFAULT CURRENT_DATE,
    sale_type           TEXT DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale', 'estore')),

    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 10. EXPENSES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expenses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description         TEXT NOT NULL,
    amount              DECIMAL(12,2) NOT NULL DEFAULT 0,
    category            TEXT NOT NULL,
    date                TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    payment_method      TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'digital')),
    notes               TEXT,
    shift_id            UUID REFERENCES shifts(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT expenses_amount_positive CHECK (amount >= 0)
);


-- ════════════════════════════════════════════════════════════════
-- 11. SALES TABS  (Multi‑tab Cashier)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_tabs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    cart                    JSONB DEFAULT '[]'::jsonb,
    selected_customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
    bill_discount_value     DECIMAL(12,2),
    bill_discount_type      TEXT,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 12. PURCHASE RECORDS  (Unified Inventory Ledger)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS purchase_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT DEFAULT 'Stock IN',
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name    TEXT NOT NULL,
    sku             TEXT,
    quantity        INTEGER NOT NULL DEFAULT 0,
    cost_price      DECIMAL(12,2) DEFAULT 0,
    retail_price    DECIMAL(12,2),
    total_amount    DECIMAL(12,2) DEFAULT 0,
    supplier        TEXT,
    date            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    added_by        TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 13. PURCHASE ORDERS  (PO Headers)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number       TEXT NOT NULL UNIQUE,
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'received', 'cancelled')),
    total_amount    DECIMAL(12,2) DEFAULT 0.00,
    notes           TEXT,
    received_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 14. PURCHASE ORDER ITEMS  (PO Line Items)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id           UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    received_qty    INTEGER DEFAULT 0,
    cost_price      DECIMAL(12,2) NOT NULL CHECK (cost_price >= 0),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 15. SUPPLIER TRANSACTIONS  (Khata / Master Ledger)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supplier_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('purchase', 'loan', 'advance', 'payment', 'return', 'opening_balance')),
    amount          DECIMAL(12,2) NOT NULL,
    reference_id    UUID,
    reference_type  TEXT,
    note            TEXT,
    balance_after   DECIMAL(12,2),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 16. PAYMENTS  (Supplier Payments)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_type    TEXT CHECK (payment_type IN ('cash', 'card', 'digital')),
    direction       TEXT CHECK (direction IN ('in', 'out')),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 17. STOCK HISTORY  (Inventory Audit Trail)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
    change_qty      INTEGER NOT NULL,
    type            TEXT CHECK (type IN ('sale', 'purchase', 'return', 'adjustment', 'initial')),
    reference_id    UUID,
    note            TEXT,
    balance_after   INTEGER,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- (shifts and shift_denominations were moved earlier to resolve FK dependencies)


-- ════════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ════════════════════════════════════════════════════════════════

-- Products
CREATE INDEX IF NOT EXISTS idx_products_sku             ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode         ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category        ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active          ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, active);
CREATE INDEX IF NOT EXISTS idx_products_name_search     ON products USING gin(to_tsvector('english', name));

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_name           ON customers USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_customers_email          ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone          ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_name_text      ON customers(name text_pattern_ops);

-- Sales
CREATE INDEX IF NOT EXISTS idx_sales_timestamp          ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id        ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number     ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_status             ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method     ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_cashier            ON sales(cashier);
CREATE INDEX IF NOT EXISTS idx_sales_created_at_status  ON sales(created_at, status);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id           ON sales(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_sale_date          ON sales(sale_date);

-- Product Batches
CREATE INDEX IF NOT EXISTS idx_product_batches_product_id    ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry        ON product_batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_batches_batch_number  ON product_batches(batch_number);

-- Discounts
CREATE INDEX IF NOT EXISTS idx_discounts_active          ON discounts(active);
CREATE INDEX IF NOT EXISTS idx_discounts_validity        ON discounts(valid_from, valid_to) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_discounts_type            ON discounts(type);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_username            ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role                ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active              ON users(active);

-- Sales Tabs
CREATE INDEX IF NOT EXISTS idx_sales_tabs_user_id        ON sales_tabs(user_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date             ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category         ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method   ON expenses(payment_method);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id         ON expenses(shift_id) WHERE shift_id IS NOT NULL;

-- Purchase Records
CREATE INDEX IF NOT EXISTS idx_purchase_records_date       ON purchase_records(date);
CREATE INDEX IF NOT EXISTS idx_purchase_records_product_id ON purchase_records(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_records_supplier   ON purchase_records(supplier);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status      ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number   ON purchase_orders(po_number);

-- Purchase Order Items
CREATE INDEX IF NOT EXISTS idx_po_items_po_id              ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id         ON purchase_order_items(product_id);

-- Supplier Transactions
CREATE INDEX IF NOT EXISTS idx_supplier_tx_supplier_id     ON supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_tx_created_at      ON supplier_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_supplier_tx_type            ON supplier_transactions(type);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_supplier_id        ON payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at         ON payments(created_at);

-- Stock History
CREATE INDEX IF NOT EXISTS idx_stock_history_product_id    ON stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_created_at    ON stock_history(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_history_type          ON stock_history(type);

-- Shifts
CREATE INDEX IF NOT EXISTS idx_shifts_user_id              ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_shift_date           ON shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_status               ON shifts(status);


-- ════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- ── Auto update_at trigger ──
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ BEGIN
  CREATE TRIGGER update_app_settings_updated_at   BEFORE UPDATE ON app_settings       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_categories_updated_at      BEFORE UPDATE ON categories          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_customers_updated_at       BEFORE UPDATE ON customers           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_suppliers_updated_at       BEFORE UPDATE ON suppliers           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_products_updated_at        BEFORE UPDATE ON products            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_product_batches_updated_at BEFORE UPDATE ON product_batches     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_discounts_updated_at       BEFORE UPDATE ON discounts           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at           BEFORE UPDATE ON users               FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_sales_updated_at           BEFORE UPDATE ON sales               FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_sales_tabs_updated_at      BEFORE UPDATE ON sales_tabs          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_expenses_updated_at        BEFORE UPDATE ON expenses            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Invoice Number Generator ──
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    counter INTEGER;
    new_invoice_number TEXT;
BEGIN
    SELECT invoice_prefix, invoice_counter 
    INTO prefix, counter 
    FROM app_settings 
    LIMIT 1;
    
    IF prefix IS NULL THEN prefix := 'INV'; END IF;
    IF counter IS NULL THEN counter := 1000; END IF;
    
    new_invoice_number := prefix || '-' || LPAD(counter::TEXT, 6, '0');
    
    UPDATE app_settings 
    SET invoice_counter = counter + 1, 
        updated_at = timezone('utc'::text, now());
    
    RETURN new_invoice_number;
END;
$$ LANGUAGE plpgsql;


-- ── Auto Invoice Number on Insert ──
CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := generate_invoice_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_auto_generate_invoice_number
      BEFORE INSERT ON sales
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_invoice_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Customer Stats Auto‑Update ──
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL AND NEW.status = 'completed' THEN
        UPDATE customers 
        SET 
            total_purchases = total_purchases + NEW.total,
            last_purchase = NEW.created_at,
            updated_at = timezone('utc'::text, now())
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_update_customer_stats
      AFTER INSERT OR UPDATE ON sales
      FOR EACH ROW
      EXECUTE FUNCTION update_customer_stats();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Auto‑Create User Profile from Supabase Auth ──
-- Every new sign-up is the Owner/Admin of their own workspace.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, name, email, role, active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.email,
        'admin', -- Every new signup is a store owner/admin
        true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── Admin-check helper (avoids RLS recursion on users table) ──
CREATE OR REPLACE FUNCTION is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'admin' 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ════════════════════════════════════════════════════════════════

-- ── Enable RLS on ALL tables ──
ALTER TABLE app_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tabs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_denominations   ENABLE ROW LEVEL SECURITY;


-- ── APP SETTINGS ──
CREATE POLICY "settings_select" ON app_settings
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "settings_all" ON app_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- ── CATEGORIES ──
CREATE POLICY "categories_select" ON categories
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "categories_all" ON categories
    FOR ALL USING (auth.role() = 'authenticated');

-- ── CUSTOMERS ──
CREATE POLICY "customers_select" ON customers
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "customers_all" ON customers
    FOR ALL USING (auth.role() = 'authenticated');

-- ── SUPPLIERS ──
CREATE POLICY "suppliers_select" ON suppliers
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "suppliers_all" ON suppliers
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PRODUCTS ──
CREATE POLICY "products_select" ON products
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "products_all" ON products
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PRODUCT BATCHES ──
CREATE POLICY "batches_select" ON product_batches
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "batches_all" ON product_batches
    FOR ALL USING (auth.role() = 'authenticated');

-- ── DISCOUNTS ──
CREATE POLICY "discounts_select" ON discounts
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "discounts_all" ON discounts
    FOR ALL USING (auth.role() = 'authenticated');

-- ── USERS (Special: Non-recursive admin checks via is_admin()) ──
CREATE POLICY "users_view_own_row" ON users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_admins_see_all" ON users
    FOR SELECT USING (is_admin());
CREATE POLICY "users_admins_manage_all" ON users
    FOR ALL USING (is_admin());
CREATE POLICY "users_self_update" ON users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
CREATE POLICY "users_insert_self" ON users
    FOR INSERT WITH CHECK (true);

-- ── SALES ──
CREATE POLICY "sales_select" ON sales
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sales_all" ON sales
    FOR ALL USING (auth.role() = 'authenticated');

-- ── SALES TABS (User-scoped) ──
CREATE POLICY "tabs_select_own" ON sales_tabs
    FOR SELECT USING (auth.role() = 'authenticated' AND user_id = auth.uid());
CREATE POLICY "tabs_manage_own" ON sales_tabs
    FOR ALL USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- ── EXPENSES ──
CREATE POLICY "expenses_select" ON expenses
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "expenses_all" ON expenses
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PURCHASE RECORDS ──
CREATE POLICY "purchase_records_select" ON purchase_records
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "purchase_records_all" ON purchase_records
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PURCHASE ORDERS ──
CREATE POLICY "purchase_orders_select" ON purchase_orders
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "purchase_orders_all" ON purchase_orders
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PURCHASE ORDER ITEMS ──
CREATE POLICY "po_items_select" ON purchase_order_items
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "po_items_all" ON purchase_order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ── SUPPLIER TRANSACTIONS ──
CREATE POLICY "supplier_tx_select" ON supplier_transactions
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "supplier_tx_all" ON supplier_transactions
    FOR ALL USING (auth.role() = 'authenticated');

-- ── PAYMENTS ──
CREATE POLICY "payments_select" ON payments
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "payments_all" ON payments
    FOR ALL USING (auth.role() = 'authenticated');

-- ── STOCK HISTORY ──
CREATE POLICY "stock_history_select" ON stock_history
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "stock_history_all" ON stock_history
    FOR ALL USING (auth.role() = 'authenticated');

-- ── SHIFTS ──
CREATE POLICY "shifts_select" ON shifts
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shifts_all" ON shifts
    FOR ALL USING (auth.role() = 'authenticated');

-- ── SHIFT DENOMINATIONS ──
CREATE POLICY "denominations_select" ON shift_denominations
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "denominations_all" ON shift_denominations
    FOR ALL USING (auth.role() = 'authenticated');


-- ════════════════════════════════════════════════════════════════
-- VIEWS
-- ════════════════════════════════════════════════════════════════

-- ── Shift Summary View ──
CREATE OR REPLACE VIEW shift_summary AS
SELECT
    s.id AS shift_id,
    s.shift_date,
    s.start_time,
    s.end_time,
    s.status,
    s.user_name,
    s.opening_cash,
    s.closing_cash_count,
    s.cash_difference,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'retail'), 0)    AS retail_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'wholesale'), 0) AS wholesale_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'estore'), 0)    AS estore_sales,
    COALESCE(SUM(sa.total), 0) AS total_sales,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'cash'), 0)    AS cash_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'card'), 0)    AS card_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'digital'), 0) AS digital_sales,

    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'cash'), 0)    AS cash_expenses,
    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'card'), 0)    AS card_expenses,
    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'digital'), 0) AS digital_expenses,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'cash'), 0) -
    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'cash'), 0)    AS cash_balance,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'card'), 0) -
    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'card'), 0)    AS card_balance,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'digital'), 0) -
    COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'digital'), 0)  AS digital_balance

FROM shifts s
LEFT JOIN sales sa ON sa.shift_id = s.id
LEFT JOIN expenses e ON e.shift_id = s.id
GROUP BY s.id;


-- ── Daily Summary View ──
CREATE OR REPLACE VIEW daily_summary AS
SELECT
    sa.sale_date,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'retail'), 0)    AS retail_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'wholesale'), 0) AS wholesale_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.sale_type = 'estore'), 0)    AS estore_sales,
    COALESCE(SUM(sa.total), 0) AS total_sales,

    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'cash'), 0)    AS cash_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'card'), 0)    AS card_sales,
    COALESCE(SUM(sa.total) FILTER (WHERE sa.payment_method = 'digital'), 0) AS digital_sales

FROM sales sa
WHERE sa.sale_date IS NOT NULL
GROUP BY sa.sale_date;


-- ════════════════════════════════════════════════════════════════
-- GRANTS  (Permissions for Supabase roles)
-- ════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;


-- ════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════

-- Default App Settings
INSERT INTO app_settings (
    store_name, currency, tax_rate, interface_mode, theme,
    invoice_prefix, invoice_counter, country, business_type
) VALUES (
    'Zaynahs Store', 'PKR', 0.0000, 'traditional', 'dark',
    'INV', 1000, 'PK', 'general'
) ON CONFLICT DO NOTHING;

-- Default Categories
INSERT INTO categories (name, description) VALUES
    ('Electronics', 'Electronic devices and accessories'),
    ('Clothing', 'Apparel and fashion items'),
    ('Food & Beverage', 'Food and drink products'),
    ('Home & Garden', 'Home improvement and garden supplies'),
    ('Books & Media', 'Books, magazines, and media content'),
    ('Health & Beauty', 'Healthcare and beauty products'),
    ('Sports & Outdoors', 'Sports equipment and outdoor gear'),
    ('Automotive', 'Car parts and automotive supplies'),
    ('General', 'General merchandise')
ON CONFLICT (name) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '  ZAYNAH''S POS v2 — SCHEMA COMPLETE';
    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables (19):';
    RAISE NOTICE '  app_settings, categories, customers, suppliers,';
    RAISE NOTICE '  products, product_batches, discounts, users,';
    RAISE NOTICE '  sales, sales_tabs, expenses, purchase_records,';
    RAISE NOTICE '  purchase_orders, purchase_order_items,';
    RAISE NOTICE '  supplier_transactions, payments, stock_history,';
    RAISE NOTICE '  shifts, shift_denominations';
    RAISE NOTICE '';
    RAISE NOTICE 'Views (2): shift_summary, daily_summary';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions: update_updated_at_column, generate_invoice_number,';
    RAISE NOTICE '  auto_generate_invoice_number, update_customer_stats,';
    RAISE NOTICE '  handle_new_user, is_admin';
    RAISE NOTICE '';
    RAISE NOTICE 'RLS Policies: Enabled on ALL 19 tables';
    RAISE NOTICE '  - Authenticated access for all business data';
    RAISE NOTICE '  - Non-recursive admin check via is_admin() on users';
    RAISE NOTICE '  - User-scoped sales_tabs';
    RAISE NOTICE '';
    RAISE NOTICE 'Indexes: % performance optimization indexes', (
        SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
    );
    RAISE NOTICE '';
    RAISE NOTICE '═══ READY FOR DEPLOYMENT ═══';
END $$;

-- Agar supplier_transactions mojud na ho tou banaye ga
CREATE TABLE IF NOT EXISTS supplier_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    type TEXT NOT NULL, 
    amount DECIMAL(15,2) NOT NULL,
    reference_id TEXT, 
    reference_type TEXT,
    note TEXT,
    balance_after DECIMAL(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Agar payments ki table na ho tou banaye ga
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    payment_type TEXT NOT NULL, 
    direction TEXT DEFAULT 'out',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- SUPABASE PAYMENTS & LEDGER SCHEMA
-- ==========================================
-- This schema handles all incoming and outgoing payments
-- and links them to suppliers and the general ledger.

-- 1. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL, -- e.g., 'cash', 'bank', 'jazzcash', 'credit'
    direction TEXT NOT NULL, -- 'in' (loan/advance) or 'out' (payment to supplier)
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Supplier Transactions (Ledger Entries)
-- This table tracks every transaction that affects a supplier's balance
CREATE TABLE IF NOT EXISTS public.supplier_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL, -- 'purchase' (debts us), 'payment' (we credit them), 'return'
    amount DECIMAL(15, 2) NOT NULL,
    reference_id TEXT, -- PO Number or Invoice Number
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_payments_supplier_id ON public.payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_supplier_id ON public.supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_type ON public.supplier_transactions(type);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;

-- 5. Basic Policies (Admin/Manager Access)
CREATE POLICY "Allow all access for authenticated users" ON public.payments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all access for authenticated users" ON public.supplier_transactions
    FOR ALL USING (auth.role() = 'authenticated');



TRUNCATE TABLE sales, sales_tabs, expenses, product_batches, purchase_records, purchase_orders, purchase_order_items, supplier_transactions, payments, stock_history CASCADE;

`;
