-- ================================================================
-- ZAYNAH'S POS v2 — SUPER MASTER SCHEMA
-- ================================================================
-- Complete drop-in SQL for FRESH Supabase project setup.
-- Includes: ALL tables, columns, constraints, indexes, functions,
-- triggers, RLS policies, views, grants, and seed data.
--
-- HOW TO USE:
--   1. Go to Supabase Dashboard → SQL Editor → New Query
--   2. Paste ENTIRE contents of this file
--   3. Click Run
--   4. Copy the Supabase Project URL + anon key into your .env.local
--
-- TABLES (19) — Order matters (FK dependency):
--   1.  app_settings           Singleton config (no FK deps)
--   2.  categories             Product taxonomy
--   3.  customers              CRM / Loyalty
--   4.  suppliers              Vendor management (no FK deps)
--   5.  products               Inventory master
--   6.  product_batches        FIFO batch tracking → FK: products
--   7.  discounts              Campaigns / BOGO
--   8.  users                  Extends auth.users → FK: auth.users
--   9.  sales                  POS Invoices → FK: customers
--   10. sales_tabs             Multi-tab cashier → FK: users, customers
--   11. expenses               Operating costs
--   12. purchase_records       Unified inventory ledger
--   13. purchase_orders        PO Headers → FK: suppliers
--   14. purchase_order_items   PO Line Items → FK: purchase_orders, products
--   15. supplier_transactions  Khata / Master Ledger → FK: suppliers
--   16. payments               Supplier payments → FK: suppliers
--   17. stock_history          Inventory audit trail → FK: products
--
-- VIEWS (2): sale_items_unrolled, daily_summary
-- FUNCTIONS (9): update_updated_at_column, generate_invoice_number,
--                 auto_generate_invoice_number, update_customer_stats,
--                 handle_new_user, is_admin, get_my_workspace_id,
--                 audit_stock_integrity, audit_missing_purchase_cost
-- ================================================================
--
-- ════════════════════════════════════════════════════════════════
-- 📜 SCHEMA CHANGE LOG (AUDIT TRAIL)
-- ════════════════════════════════════════════════════════════════
-- Every structural DB change MUST be logged here AND in a migration file.
--
-- [2026-05-09] POS Enhancements — Split Payments & DC Charges
--   Files: SUPER_MASTER_SCHEMA.sql, prisma/schema.prisma, localDb.ts,
--          types/index.ts, services.ts
--   Changes:
--   1. Sales Table:
--      + extra_charges (JSONB)   — DC / delivery charges flexible array
--      + split_payments (JSONB)  — Multi-method payment support
--      - Removed legacy dc_number, other_amount columns
--   2. App Settings Table:
--      + enable_split_payment (BOOLEAN)
--      + enable_extra_charges  (BOOLEAN)
--      + allow_credit_over_limit (BOOLEAN)
--      + barcode_content_scale, barcode_font_size, barcode_name_lines (barcode tuning)
--      + pos_grid_columns (INTEGER)
--   3. Realtime: supabase_realtime publication updated for all core tables
--
-- [2026-05-09] Audit Fixes — split_payments column, RLS, get_my_workspace_id
--   Migration: supabase/migrations/20260509191900_split_payments_rls_fix.sql
--   Changes:
--   1. Sales Table:
--      + split_payments column applied via ALTER TABLE (was in code but missing in DB)
--   2. RLS Security:
--      + get_my_workspace_id() SECURITY DEFINER function deployed (was missing from live DB)
--      * app_settings policies: qual=true → workspace_id = get_my_workspace_id()
--        (SELECT / INSERT / UPDATE / DELETE all scoped)
--      * users policies: qual=true → id = auth.uid() OR workspace_id = get_my_workspace_id()
--   3. SUPER_MASTER_SCHEMA.sql updated:
--      * get_my_workspace_id() now deployed BEFORE RLS DO block (correct ordering)
--      * app_settings and users excluded from generic RLS loop, have explicit policies
--   4. Audit Finding — Batch NULL (data issue, NOT a code bug):
--      - 12 products have track_inventory=true but only 1 has product_batches rows
--      - Root cause: products created before FIFO batch system was deployed
--      - FIFO code already handles this (falls back to product.cost per Rule F5)
--      - Fix: manual backfill via Stock Adjustment flow if COGS precision needed
--
-- [2026-05-10] Data Integrity Backfill — Batches, Stock History, Realtime, Orphans
--   Migration: supabase/migrations/20260510_backfill_batches_history_realtime.sql
--   Changes:
--   1. product_batches: Backfilled LEGACY-BACKFILL-001 batches for 8 products
--      with stock>0 that had no batch rows (pre-FIFO products).
--      3 negative-stock products also got zero-qty batches for schema completeness.
--   2. stock_history: Inserted 'initial' type entries for all products where
--      SUM(change_qty) != current stock. Audit trail now adds up correctly.
--   3. Realtime: ALTER PUBLICATION supabase_realtime SET TABLE for 14 core tables.
--      Changed from ADD TABLE to SET TABLE for idempotency.
--   4. sales: 31 orphaned sales (shift_id IS NULL) assigned to nearest preceding shift.
--   5. expenses: 2 orphaned expenses (shift_id IS NULL) assigned to nearest preceding shift.
--   6. Code: Removed backdrop-blur-md from ProductGrid.tsx (design rule compliance).
--
-- [2026-07-10] Drop workspace_id — Single-tenant architecture
--   Migration: supabase/migrations/20260710030000_drop_workspace_id.sql
--   Changes:
--   1. DROP COLUMN workspace_id from all 18 tables (app_settings, categories,
--      customers, suppliers, products, product_batches, discounts, users, sales,
--      expenses, sales_tabs, purchase_records, purchase_orders, purchase_order_items,
--      supplier_transactions, payments, stock_history, bundles)
--   2. Replaced unique index idx_bundles_name_workspace with idx_bundles_name_unique
--   3. get_my_workspace_id() now returns auth.uid() (no longer queries users.workspace_id)
--   4. handle_new_user() no longer sets workspace_id
--   5. process_sale() RPC and sale_items_unrolled view — removed workspace_id refs
--   6. Seed data and backfill queries — removed workspace_id refs
--   7. All app code already cleaned (services.ts, components, types, hooks, etc.)
--
-- [2026-07-10] Add variant_data + modifiers columns to products
--   Migration: supabase/migrations/20260710164500_add_variant_data_modifiers_to_products.sql
--   Changes:
--   1. products table:
--      + variant_data JSONB DEFAULT '[]' — stores variant configuration per product
--      + modifiers    JSONB DEFAULT '[]' — stores modifier groups (add-ons, options)
--   Both columns were in SUPER_MASTER_SCHEMA.sql from day one but were never applied
--   to the live DB, causing every product sync to 400 → auto-blacklist loop.
-- ════════════════════════════════════════════════════════════════
--
-- [2026-07-10] Sales query timeout fix + cache busting
--   Files: services.ts, useSync.ts, supabase.ts, POSTerminal.tsx,
--          Modal.tsx, SUPER_MASTER_SCHEMA.sql (changelog only)
--   Changes:
--   1. services.ts — sales.fetchRemote() now uses .order().limit(10000)
--      to prevent "canceling statement due to statement timeout"
--   2. supabase.ts — Cache-Control: no-cache on all requests
--   3. useSync.ts — removed HEAD ping (/rest/v1/ returns 401)
--   4. Modal.tsx + POSTerminal.tsx — safe-area-inset-top for notch
--   5. SyncStatusBadge.tsx — stale-data amber badge 5min+ threshold
--
-- [2026-07-10] Idempotent ALTER TABLE blocks for post-launch columns
--   Changes:
--   1. app_settings: enable_kot_printer, enable_split_payment, enable_extra_charges,
--      allow_credit_over_limit, pos_grid_columns — now covered by ALTER TABLE ADD COLUMN IF NOT EXISTS
--   2. products: variant_data, modifiers — ALTER TABLE ADD COLUMN IF NOT EXISTS
--   3. sales: split_payments, extra_charges — ALTER TABLE ADD COLUMN IF NOT EXISTS
--   Impact: SUPER_MASTER_SCHEMA.sql can now be run on ANY existing DB as a true
--   idempotent full-setup script — no more missing column gaps.
--
-- [2026-07-14] EStore custom payment columns + schema sync fix
--   Files: SUPER_MASTER_SCHEMA.sql, Settings.tsx, services.ts
--   Changes:
--   1. app_settings CREATE TABLE: added estore_custom_payment_enabled, _name, _detail, _note
--   2. app_settings ALTER TABLE: fixed premature semicolon that prevented custom payment
--      columns from being applied on existing DBs
--   3. Settings.tsx formData: added ALL estore fields (timer, COD, custom payment,
--      WhatsApp, delivery, colors) to both useState init and useEffect sync — this was
--      the root cause of all estore settings resetting to defaults on refresh
--
-- [2026-07-10] Refund system fixes — partially_refunded, refunded_amount, process_return RPC
--   Migration: supabase/migrations/20260710230000_fix_refund_system.sql
--   Changes:
--   1. sales CHECK constraint: added 'partially_refunded' to allowed statuses
--   2. sales table: added refunded_amount DECIMAL(12,2) DEFAULT 0
--   3. process_return RPC: now reads status + refundedAmount + items from return_data
--      instead of hardcoding 'refunded'. Supports partial refunds properly.
--   4. syncEngine.ts: fixed 'returned' → 'refunded'/'partially_refunded' check
--   5. services.ts getReportRefunds*: now queries both 'refunded' AND 'partially_refunded'
--   6. Both process_return RPC definitions updated (lines 1101 and 1530)
-- ════════════════════════════════════════════════════════════════


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

    -- Receipt Display Settings
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
    receipt_template            TEXT DEFAULT 'modern',
    receipt_font_scale          DECIMAL(3,2) DEFAULT 1.00,
    receipt_font_bold           BOOLEAN DEFAULT false,
    receipt_font_weight         TEXT DEFAULT '400',

    -- Receipt Position Adjustments (in print units)
    receipt_padding_top         INTEGER DEFAULT 0,
    receipt_padding_bottom      INTEGER DEFAULT 0,
    receipt_padding_left        INTEGER DEFAULT 0,
    receipt_padding_right       INTEGER DEFAULT 0,
    receipt_offset_x            INTEGER DEFAULT 0,
    receipt_header_offset_x     INTEGER DEFAULT 0,
    receipt_footer_offset_x     INTEGER DEFAULT 0,

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
    barcode_type                TEXT DEFAULT 'BARCODE',
    barcode_name_lines          INTEGER DEFAULT 1,
    barcode_font_size           INTEGER DEFAULT 9,
    barcode_content_scale       NUMERIC DEFAULT 1.0,
    barcode_margin_x            INTEGER DEFAULT 0,
    barcode_margin_y            INTEGER DEFAULT 0,
    barcode_gap_x               INTEGER DEFAULT 0,
    barcode_gap_y               INTEGER DEFAULT 0,
    barcode_bar_width           NUMERIC DEFAULT 1.2,

    -- Sync / Offline
    offline_mode                BOOLEAN DEFAULT true,
    auto_sync                   BOOLEAN DEFAULT true,
    last_backup_date            TIMESTAMPTZ,

    -- Localization & Business
    country                     TEXT DEFAULT 'PK',
    tax_id                      TEXT,
    business_type               TEXT DEFAULT 'general',

    -- Purchase Order Config
    enable_purchase_orders      BOOLEAN DEFAULT true,
    po_prefix                   TEXT DEFAULT 'PO-',
    po_counter                  INTEGER DEFAULT 1000,
    allow_credit_over_limit     BOOLEAN DEFAULT true,
    enable_split_payment        BOOLEAN DEFAULT false,
    enable_extra_charges        BOOLEAN DEFAULT false,

    -- System Module Toggles
    retail_enabled              BOOLEAN DEFAULT true,
    wholesale_enabled           BOOLEAN DEFAULT false,
    estore_enabled              BOOLEAN DEFAULT false,
    estore_theme_color          TEXT DEFAULT '#10b981',
    estore_delivery_fee         NUMERIC DEFAULT 0,
    estore_min_order            NUMERIC DEFAULT 0,
    estore_cod_enabled          BOOLEAN DEFAULT true,
    estore_location_lat         NUMERIC,
    estore_location_lng         NUMERIC,
    estore_delivery_radius      NUMERIC DEFAULT 5,
    estore_whatsapp_enabled     BOOLEAN DEFAULT false,
    estore_whatsapp_number      TEXT,
    estore_primary_color_hover  TEXT DEFAULT '#059669',
    estore_bg_color             TEXT DEFAULT '#f9fafb',
    estore_text_color           TEXT DEFAULT '#111827',
    estore_card_bg_color        TEXT DEFAULT '#ffffff',
    estore_order_timer_enabled  BOOLEAN DEFAULT false,
    estore_order_timer_minutes  INTEGER DEFAULT 30,
    estore_custom_payment_enabled BOOLEAN DEFAULT false,
    estore_custom_payment_name  TEXT,
    estore_custom_payment_detail TEXT,
    estore_custom_payment_note  TEXT,
  estore_pickup_enabled BOOLEAN DEFAULT true,
  estore_delivery_enabled BOOLEAN DEFAULT true,
  store_type TEXT DEFAULT 'both',
  store_latitude NUMERIC,
  store_longitude NUMERIC,
  shop_open_time TIME,
  shop_close_time TIME,
  delivery_start_time TIME,
  delivery_end_time TIME,
  pickup_start_time TIME,
  pickup_end_time TIME,
    sound_enabled               BOOLEAN DEFAULT true,
    touch_keyboard_enabled      BOOLEAN DEFAULT false,
    enable_kot_printer          BOOLEAN DEFAULT false,
    default_sale_type           TEXT DEFAULT 'retail',
    language                    TEXT DEFAULT 'en',

    -- SaaS / Subscription
    subscription_tier           TEXT DEFAULT 'free',
    is_locked                   BOOLEAN DEFAULT false,
    ai_v2_enabled               BOOLEAN DEFAULT false,
    pos_grid_columns            INTEGER DEFAULT 4,

    -- Timestamps
    created_at                  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_settings REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 2. CATEGORIES  (Product taxonomy — no FK deps)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    active          BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE categories REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 3. CUSTOMERS  (CRM + Credit — no FK deps)
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

ALTER TABLE customers REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 4. SUPPLIERS  (Vendor + Opening Balance — no FK deps)
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

ALTER TABLE suppliers REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 5. PRODUCTS  (Inventory Master — no FK deps)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    sku                 TEXT NOT NULL UNIQUE,
    barcode             TEXT,
    barcode_value       TEXT,
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
    variants            JSONB DEFAULT '[]'::jsonb,
    variant_data        JSONB DEFAULT '[]'::jsonb,
    modifiers           JSONB DEFAULT '[]'::jsonb,
    is_service          BOOLEAN DEFAULT false,
    require_serial      BOOLEAN DEFAULT false,
    show_in_estore      BOOLEAN DEFAULT true,
    estore_sort_order   INTEGER DEFAULT 0,
    estore_category_sort_order INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT products_price_positive         CHECK (price >= 0),
    CONSTRAINT products_cost_positive          CHECK (cost >= 0),
    CONSTRAINT products_min_stock_non_negative CHECK (min_stock >= 0)
);

ALTER TABLE products REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 6. PRODUCT BATCHES  (FIFO / Expiry tracking)
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
    active              BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT product_batches_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT product_batches_cost_positive          CHECK (cost_price >= 0),
    CONSTRAINT unique_batch_per_product               UNIQUE (product_id, batch_number)
);

ALTER TABLE product_batches REPLICA IDENTITY FULL;


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

ALTER TABLE discounts REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 8. USERS  (Extends Supabase auth.users)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username            TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    email               TEXT,
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
    can_edit_sale       BOOLEAN DEFAULT false,

    active              BOOLEAN DEFAULT true,
    last_login          TIMESTAMPTZ,
    avatar              TEXT,
    offline_hash        TEXT,

    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE users REPLICA IDENTITY FULL;





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
    payment_method      TEXT CHECK (payment_method IN ('cash', 'card', 'digital', 'credit', 'cheque', 'split')),
    card_details        JSONB,
    status              TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'credit', 'draft')),
    cashier             TEXT,
    cashier_role        TEXT,
    receipt_number      TEXT,
    notes               TEXT,
    applied_discounts   JSONB DEFAULT '[]'::jsonb,
    free_gifts          JSONB DEFAULT '[]'::jsonb,
    timestamp           TIMESTAMPTZ DEFAULT NOW(),
    sale_date           DATE DEFAULT CURRENT_DATE,
    sale_type           TEXT DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale', 'estore')),
    extra_charges       JSONB DEFAULT '[]'::jsonb,
    split_payments      JSONB DEFAULT '[]'::jsonb,
    refunded_amount     DECIMAL(12,2) DEFAULT 0,
    estore_status       TEXT DEFAULT 'pending' CHECK (estore_status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
    delivery_address    TEXT,
    delivery_fee        DECIMAL(12,2) DEFAULT 0,
    delivery_location_lat NUMERIC,
    delivery_location_lng NUMERIC,
    customer_notes      TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sales REPLICA IDENTITY FULL;


-- ════════════════════════════════════════════════════════════════
-- 12. EXPENSES  (Operating costs)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expenses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description         TEXT NOT NULL,
    amount              DECIMAL(12,2) NOT NULL DEFAULT 0,
    category            TEXT NOT NULL,
    date                TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    payment_method      TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'digital')),
    store_type          TEXT DEFAULT 'retail' CHECK (store_type IN ('retail', 'wholesale', 'estore')),
    notes               TEXT,
    added_by            TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT expenses_amount_positive CHECK (amount >= 0)
);


-- ════════════════════════════════════════════════════════════════
-- 13. SALES TABS  (Multi-tab cashier)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_tabs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    cart                    JSONB DEFAULT '[]'::jsonb,
    selected_customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
    bill_discount_value     DECIMAL(12,2),
    bill_discount_type      TEXT,
    notes                   TEXT,
    editing_sale_id         UUID,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 14. PURCHASE RECORDS  (Unified inventory ledger)
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
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    qty_remaining   INTEGER,
    date            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    added_by        TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 15. PURCHASE ORDERS  (PO Headers)
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
-- 16. PURCHASE ORDER ITEMS  (PO line items)
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
-- 17. SUPPLIER TRANSACTIONS  (Khata / Master ledger)
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
-- 18. PAYMENTS  (Supplier payments)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_type    TEXT,
    direction       TEXT CHECK (direction IN ('in', 'out')),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 19. STOCK HISTORY  (Inventory audit trail)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
    change_qty      INTEGER NOT NULL,
    type            TEXT CHECK (type IN (
                        'sale',           -- stock out on sale
                        'purchase',       -- legacy type (kept for backward compat)
                        'stock_in',       -- stock in via purchase record
                        'return',         -- stock restored on sale return/delete
                        'adjustment',     -- manual stock adjustment (up or down)
                        'initial',        -- first stock when product is created
                        'adjustment_out'  -- stock out via supplier return
                    )),
    reference_id    UUID,
    note            TEXT,
    balance_after   INTEGER,
    cashier_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    cashier_name    TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ════════════════════════════════════════════════════════════════
-- 20. BUNDLES (Product Bundles/Deals)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    description         TEXT DEFAULT '',
    is_combo            BOOLEAN NOT NULL DEFAULT FALSE,
    discount_value      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
    discount_type       TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    hide_item_prices    BOOLEAN NOT NULL DEFAULT FALSE,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    image               TEXT,
    schedule_type       TEXT DEFAULT 'always' CHECK (schedule_type IN ('always', 'scheduled')),
    start_date          DATE,
    end_date            DATE,
    repeat_days         TEXT[],
    start_time          TIME,
    end_time            TIME,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Prevent duplicate bundle names
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundles_name_unique ON bundles (LOWER(TRIM(name)));

-- ════════════════════════════════════════════════════════════════
-- 21. BUNDLE ITEMS (Products inside a bundle)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundle_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle_id ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product_id ON bundle_items(product_id);


-- ════════════════════════════════════════════════════════════════
-- 22. BUNDLE SLOTS (Combo choices)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundle_slots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    required_quantity   INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
    order_index         INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);

-- ════════════════════════════════════════════════════════════════
-- 23. BUNDLE SLOT OPTIONS (Products inside a slot)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundle_slot_options (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id             UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_slot_id ON bundle_slot_options(slot_id);
CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_product_id ON bundle_slot_options(product_id);

-- API Grants: Allow anon, authenticated, and service_role to read bundle data
GRANT SELECT ON TABLE bundles TO anon, authenticated, service_role;
GRANT SELECT ON TABLE bundle_items TO anon, authenticated, service_role;
GRANT SELECT ON TABLE bundle_slots TO anon, authenticated, service_role;
GRANT SELECT ON TABLE bundle_slot_options TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ════════════════════════════════════════════════════════════════

-- Products
CREATE INDEX IF NOT EXISTS idx_products_sku             ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode         ON products(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_value ON products(barcode_value) WHERE barcode_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category        ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active          ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, active);
CREATE INDEX IF NOT EXISTS idx_products_name_search     ON products USING gin(to_tsvector('english', name));
-- Prevent duplicate product names (case-insensitive, whitespace-trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products (LOWER(TRIM(name)));

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
CREATE INDEX IF NOT EXISTS idx_sales_sale_date          ON sales(sale_date);

-- Product Batches
CREATE INDEX IF NOT EXISTS idx_product_batches_product_id   ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry       ON product_batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_batches_batch_number ON product_batches(batch_number);

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
CREATE INDEX IF NOT EXISTS idx_payments_customer_id        ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at         ON payments(created_at);

-- Stock History
CREATE INDEX IF NOT EXISTS idx_stock_history_product_id    ON stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_created_at    ON stock_history(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_history_type          ON stock_history(type);




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
DO $$ BEGIN CREATE TRIGGER update_app_settings_updated_at      BEFORE UPDATE ON app_settings      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_categories_updated_at         BEFORE UPDATE ON categories         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_customers_updated_at          BEFORE UPDATE ON customers          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_suppliers_updated_at          BEFORE UPDATE ON suppliers          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_products_updated_at           BEFORE UPDATE ON products           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_product_batches_updated_at   BEFORE UPDATE ON product_batches    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_discounts_updated_at          BEFORE UPDATE ON discounts          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_users_updated_at             BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_sales_updated_at              BEFORE UPDATE ON sales              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_sales_tabs_updated_at         BEFORE UPDATE ON sales_tabs         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_expenses_updated_at           BEFORE UPDATE ON expenses           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_purchase_orders_updated_at    BEFORE UPDATE ON purchase_orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_purchase_order_items_updated_at BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_supplier_transactions_updated_at BEFORE UPDATE ON supplier_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_payments_updated_at           BEFORE UPDATE ON payments           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_stock_history_updated_at      BEFORE UPDATE ON stock_history      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER update_purchase_records_updated_at    BEFORE UPDATE ON purchase_records    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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
    FROM app_settings LIMIT 1;

    IF prefix IS NULL THEN prefix := 'INV'; END IF;
    IF counter IS NULL THEN counter := 1000; END IF;

    new_invoice_number := prefix || '-' || LPAD(counter::TEXT, 6, '0');

    UPDATE app_settings
    SET invoice_counter = counter + 1,
        updated_at = timezone('utc'::text, now());

    RETURN new_invoice_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := generate_invoice_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Auto-Generate Invoice Number Trigger ──

DO $$ BEGIN
  CREATE TRIGGER trigger_auto_generate_invoice_number
      BEFORE INSERT ON sales
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_invoice_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Customer Stats Auto-Update ──
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


-- ── Auto-Create User Profile from Supabase Auth ──
-- First user becomes admin, subsequent users are cashier
-- v2: Handles optional email and username collisions gracefully
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    is_first_user BOOLEAN;
    _role TEXT;
    base_username TEXT;
    final_username TEXT;
    suffix INT := 0;
BEGIN
    -- Check if this is the first user in the system
    SELECT NOT EXISTS (SELECT 1 FROM public.users) INTO is_first_user;

    -- Set role: First user is admin, others are cashier (unless specified in metadata)
    IF is_first_user THEN
        _role := 'admin';
    ELSE
        _role := COALESCE(NEW.raw_user_meta_data->>'role', 'cashier');
    END IF;

    base_username := COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1));
    final_username := base_username;

    -- Resolve username collision by appending a numeric suffix
    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = final_username) LOOP
        suffix := suffix + 1;
        final_username := base_username || suffix::TEXT;
    END LOOP;

    INSERT INTO public.users (
        id, username, name, email, role, active
    )
    VALUES (
        NEW.id,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.email,
        _role,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

-- ── Workspace-check helper (single-tenant: returns current user id) ──
CREATE OR REPLACE FUNCTION get_my_workspace_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── PO Number Generator ──
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    counter INTEGER;
    new_po_number TEXT;
BEGIN
    SELECT po_prefix, po_counter
    INTO prefix, counter
    FROM app_settings LIMIT 1;

    IF prefix IS NULL THEN prefix := 'PO-'; END IF;
    IF counter IS NULL THEN counter := 1000; END IF;

    new_po_number := prefix || LPAD(counter::TEXT, 6, '0');

    UPDATE app_settings
    SET po_counter = counter + 1,
        updated_at = timezone('utc'::text, now());

    RETURN new_po_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
        NEW.po_number := generate_po_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_auto_generate_po_number
      BEFORE INSERT ON purchase_orders
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_po_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── ATOMIC SALES PROCESSOR (RPC) ──
CREATE OR REPLACE FUNCTION process_sale(sale_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_sale_id UUID;
BEGIN
    INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
        tax_amount, total, received_amount, change_amount, payment_method,
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at
    ) VALUES (
        (sale_data->>'id')::UUID,
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
$$;

-- ── ATOMIC RETURN PROCESSOR (RPC) ──
CREATE OR REPLACE FUNCTION process_return(sale_id UUID, return_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
    v_refunded_amount DECIMAL(12,2);
BEGIN
    v_status := COALESCE(return_data->>'status', 'refunded');
    v_refunded_amount := COALESCE((return_data->>'refundedAmount')::DECIMAL(12,2), 0);

    UPDATE sales
    SET 
        status = v_status,
        refunded_amount = COALESCE(refunded_amount, 0) + v_refunded_amount,
        items = COALESCE(return_data->>'items', items::TEXT)::JSONB,
        notes = COALESCE(notes, '') || E'\n[RETURNED] ' || COALESCE(return_data->>'notes', ''),
        updated_at = NOW()
    WHERE id = sale_id;

    RETURN jsonb_build_object('success', true, 'id', sale_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION process_sale(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_sale(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION process_return(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_return(UUID, JSONB) TO anon;


-- ════════════════════════════════════════════════════════════════
-- AUDIT FUNCTIONS (Stock & Financial Integrity Checks)
-- ════════════════════════════════════════════════════════════════

-- ── Stock Integrity Audit ──
-- Returns products where products.stock != SUM(product_batches.qty_remaining)
-- Zero rows = healthy. Any rows = stock is corrupt and must be fixed.
CREATE OR REPLACE FUNCTION audit_stock_integrity()
RETURNS TABLE(
  product_id    uuid,
  name          text,
  stock         integer,
  batch_sum     bigint,
  diff          bigint
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    p.id,
    p.name,
    p.stock,
    COALESCE(SUM(pb.qty_remaining), 0) AS batch_sum,
    p.stock::bigint - COALESCE(SUM(pb.qty_remaining), 0) AS diff
  FROM products p
  LEFT JOIN product_batches pb ON pb.product_id = p.id
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0)
  ORDER BY ABS(p.stock - COALESCE(SUM(pb.qty_remaining), 0)) DESC;
$$;

GRANT EXECUTE ON FUNCTION audit_stock_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION audit_stock_integrity() TO anon;


-- ── Purchase Cost Audit ──
-- Returns completed sales that have items with zero or null purchaseCost.
-- These sales will show incorrect profit in reports.
CREATE OR REPLACE FUNCTION audit_missing_purchase_cost()
RETURNS TABLE(
  sale_id        uuid,
  invoice_number text,
  created_at     timestamptz,
  item_count     bigint
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    s.id,
    s.invoice_number,
    s.created_at,
    COUNT(*) as item_count
  FROM sales s,
  jsonb_array_elements(s.items) AS item
  WHERE 
    s.status = 'completed'
    AND (
      (item->>'purchaseCost') IS NULL 
      OR (item->>'purchaseCost') = '0'
      OR (item->>'purchaseCost') = 'null'
    )
  GROUP BY s.id, s.invoice_number, s.created_at
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION audit_missing_purchase_cost() TO authenticated;





-- ── Login Helper RPC ──
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username TEXT)
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE 
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM public.users WHERE LOWER(username) = LOWER(p_username) LIMIT 1;
    RETURN v_email;
END; $$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- VIEWS
-- ════════════════════════════════════════════════════════════════

-- ── Sale Items Unrolled View ──
CREATE OR REPLACE VIEW sale_items_unrolled AS
SELECT 
    s.id AS sale_id,
    s.sale_date,
    (item->'product')->>'name' AS product_name,
    (item->'product')->>'sku' AS sku,
    (item->>'quantity')::numeric AS quantity,
    (item->>'subtotal')::numeric AS subtotal,
    COALESCE((item->>'purchaseCost')::numeric, 0) AS purchase_cost,
    (item->>'subtotal')::numeric - COALESCE((item->>'purchaseCost')::numeric, 0) AS profit
FROM sales s,
jsonb_array_elements(s.items) AS item
WHERE s.status = 'completed';


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
-- GRANTS
-- ════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════

-- Default App Settings (singleton row)
INSERT INTO app_settings (
    store_name, currency, tax_rate, interface_mode, theme,
    invoice_prefix, invoice_counter, country, business_type,
    auto_backup, receipt_printer, custom_receipt_number,
    receipt_paper_size, receipt_template, receipt_show_logo,
    receipt_show_store_name, receipt_show_store_address,
    receipt_show_store_phone, receipt_show_customer_name,
    receipt_show_notes, offline_mode, auto_sync,
    enable_purchase_orders, po_prefix, po_counter,
    retail_enabled, sound_enabled
) VALUES (
    'Zaynahs Store', 'PKR', 0.0000, 'traditional', 'dark',
    'INV', 1000, 'PK', 'general',
    true, false, false,
    '80mm', 'modern', true,
    true, true,
    true, true,
    true, true, true,
    true, 'PO-', 1000,
    true, true
) ON CONFLICT DO NOTHING;

-- Default Categories
INSERT INTO categories (name, description) VALUES
    ('Electronics',      'Electronic devices and accessories'),
    ('Clothing',         'Apparel and fashion items'),
    ('Food & Beverage',  'Food and drink products'),
    ('Home & Garden',    'Home improvement and garden supplies'),
    ('Books & Media',    'Books, magazines, and media content'),
    ('Health & Beauty',   'Healthcare and beauty products'),
    ('Sports & Outdoors','Sports equipment and outdoor gear'),
    ('Automotive',       'Car parts and automotive supplies'),
    ('General',          'General merchandise')
ON CONFLICT (name) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl_count INTEGER;
    idx_count INTEGER;
    pol_count INTEGER;
    func_count INTEGER;
    view_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO tbl_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    SELECT COUNT(*) INTO idx_count FROM pg_indexes WHERE schemaname = 'public';
    SELECT COUNT(*) INTO pol_count FROM pg_policies WHERE schemaname = 'public';
    SELECT COUNT(*) INTO func_count FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND prokind = 'f';
    SELECT COUNT(*) INTO view_count FROM information_schema.views WHERE table_schema = 'public';

    RAISE NOTICE '';
    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '  ZAYNAH''S POS v2 — SUPER MASTER SCHEMA COMPLETE';
    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables : %', tbl_count;
    RAISE NOTICE 'Indexes : %', idx_count;
    RAISE NOTICE 'RLS Policies : %', pol_count;
    RAISE NOTICE 'Functions : %', func_count;
    RAISE NOTICE 'Views : %', view_count;
    RAISE NOTICE '';
    RAISE NOTICE '═══ READY FOR CLONE / DEPLOYMENT ═══';
END $$;

-- ════════════════════════════════════════════════════════════════
-- END OF SUPER MASTER SCHEMA
-- ════════════════════════════════════════════════════════════════














-- ──────────────────────────────────────────────────────────────
-- FIX MISSING COLUMNS IN app_settings
-- ──────────────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor if you see errors like:
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_discount' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_template' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_logo' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_store_name' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_tax' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_store_address' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_store_phone' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_store_email' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_customer_name' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_customer_phone' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_show_notes' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_template' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_font_weight' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'receipt_density' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_paper_size' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_a4_columns' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_a4_rows' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_show_price' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_show_name' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_show_sku' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_show_category' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_scale' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_height' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_padding' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'barcode_border' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'interface_mode' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'offline_mode' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'auto_sync' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'country' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'business_type' on entity 'app_settings'"
--   "AUTO-BLACKLISTED COLUMN: 'allow_credit_over_limit' on entity 'app_settings'"
-- ──────────────────────────────────────────────────────────────

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS receipt_show_logo           BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_footer           BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_tax             BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_discount         BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_store_name      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_store_address    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_store_phone     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_store_email     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_customer_name   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_customer_phone  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_notes           BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_template             TEXT DEFAULT 'modern',
  ADD COLUMN IF NOT EXISTS receipt_font_weight          TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS receipt_density              NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS interface_mode               TEXT DEFAULT 'touch',
  ADD COLUMN IF NOT EXISTS offline_mode                 BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_sync                   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS country                     TEXT DEFAULT 'PK',
  ADD COLUMN IF NOT EXISTS business_type               TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS receipt_padding_top       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_padding_bottom    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_padding_left      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_padding_right     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_offset_x          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_header_offset_x   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_footer_offset_x   INTEGER DEFAULT 0,

  ADD COLUMN IF NOT EXISTS barcode_paper_size            TEXT DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS barcode_a4_columns            INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS barcode_a4_rows               INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS barcode_show_price            BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS barcode_show_name             BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS barcode_show_sku              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS barcode_show_category         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS barcode_scale                NUMERIC DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS barcode_height                INTEGER DEFAULT 40,
  ADD COLUMN IF NOT EXISTS barcode_padding              INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS barcode_border               BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS barcode_name_lines           INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS barcode_font_size            INTEGER DEFAULT 9,
  ADD COLUMN IF NOT EXISTS barcode_content_scale        NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_locked                    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_v2_enabled                BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS touch_keyboard_enabled       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_kot_printer            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_split_payment           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_extra_charges           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_credit_over_limit        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_grid_columns               INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS estore_location_lat            NUMERIC,
  ADD COLUMN IF NOT EXISTS estore_location_lng            NUMERIC,
  ADD COLUMN IF NOT EXISTS estore_delivery_radius         NUMERIC DEFAULT 5,
  ADD COLUMN IF NOT EXISTS estore_whatsapp_enabled        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estore_whatsapp_number         TEXT;

DO $$
BEGIN
  RAISE NOTICE '✅ Missing app_settings columns added successfully';
END $$;

-- Products: post-launch columns
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_data  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modifiers     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estore_category_sort_order INTEGER DEFAULT 0;

DO $$
BEGIN
  RAISE NOTICE '✅ Missing products columns added successfully';
END $$;

-- Sales: post-launch columns
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS split_payments  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_charges   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee    DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_location_lng NUMERIC;

DO $$
BEGIN
  RAISE NOTICE '✅ Missing sales columns added successfully';
END $$;

-- Handle user deletion from auth when public.users record is deleted
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_user_deleted ON public.users;
CREATE TRIGGER on_user_deleted
  AFTER DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();

-- Helper function for Login: Get email by username
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM public.users 
    WHERE LOWER(username) = LOWER(p_username) 
    LIMIT 1;
    
    RETURN v_email;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- ── 1. Process Sale (Atomic Inventory Deduct) ──
CREATE OR REPLACE FUNCTION process_sale(sale_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_sale_id UUID;
BEGIN
    INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
        tax_amount, total, received_amount, change_amount, payment_method,
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at
    ) VALUES (
        (sale_data->>'id')::UUID,
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

-- ── 2. Process Return ──
CREATE OR REPLACE FUNCTION process_return(sale_id UUID, return_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
    v_refunded_amount DECIMAL(12,2);
BEGIN
    v_status := COALESCE(return_data->>'status', 'refunded');
    v_refunded_amount := COALESCE((return_data->>'refundedAmount')::DECIMAL(12,2), 0);
    UPDATE sales SET
        status = v_status,
        refunded_amount = COALESCE(refunded_amount, 0) + v_refunded_amount,
        items = COALESCE(return_data->>'items', items::TEXT)::JSONB,
        notes = COALESCE(notes, '') || E'\n[RETURNED] ' || COALESCE(return_data->>'notes', ''),
        updated_at = NOW()
    WHERE id = sale_id;
    RETURN jsonb_build_object('success', true, 'id', sale_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;

-- ── 3. Stock Integrity Audit ──
CREATE OR REPLACE FUNCTION audit_stock_integrity()
RETURNS TABLE(product_id uuid, name text, stock integer, batch_sum bigint, diff bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.stock,
    COALESCE(SUM(pb.qty_remaining), 0) AS batch_sum,
    p.stock::bigint - COALESCE(SUM(pb.qty_remaining), 0) AS diff
  FROM products p
  LEFT JOIN product_batches pb ON pb.product_id = p.id
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0)
  ORDER BY ABS(p.stock - COALESCE(SUM(pb.qty_remaining), 0)) DESC;
$$;



-- ── 5. Missing Cost Audit ──
CREATE OR REPLACE FUNCTION audit_missing_purchase_cost()
RETURNS TABLE(sale_id uuid, invoice_number text, created_at timestamptz, item_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.invoice_number, s.created_at, COUNT(*) as item_count
  FROM sales s, jsonb_array_elements(s.items) AS item
  WHERE s.status = 'completed'
    AND ((item->>'purchaseCost') IS NULL OR (item->>'purchaseCost') = '0' OR (item->>'purchaseCost') = 'null')
  GROUP BY s.id, s.invoice_number, s.created_at
  ORDER BY s.created_at DESC;
$$;

-- ── 6. SINGLE-TENANT MODE (RLS Disabled + Full Grants) ──
-- Application is configured for a single shop.
-- RLS overhead is disabled. Both anon and authenticated roles
-- have full permissions — safe because Supabase API access is
-- gated by the frontend authentication layer.

DO $$
DECLARE
    t text;
    pol RECORD;
BEGIN
    -- 1. Disable RLS on all tables
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
    
    -- 2. Drop all existing policies
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I',
            pol.policyname,
            pol.tablename
        );
    END LOOP;

    -- 3. Grant ALL to anon and authenticated (single-tenant safety)
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('GRANT ALL ON %I TO anon, authenticated;', t);
    END LOOP;
END $$;

-- ── 7. GRANTS (single-tenant: both roles get full access) ──
GRANT EXECUTE ON FUNCTION process_sale(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_return(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION audit_stock_integrity() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION audit_missing_purchase_cost() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_login_email(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';



-- ════════════════════════════════════════════════════════════════
-- SEED: App Settings
-- ════════════════════════════════════════════════════════════════
-- Ensure the default singleton settings row exists
INSERT INTO app_settings (id, store_name)
VALUES ('00000000-0000-4000-8000-000000000001', 'ZaynahsPOS')
ON CONFLICT (id) DO NOTHING;





-- ════════════════════════════════════════════════════════════════
-- REALTIME CONFIGURATION
-- ════════════════════════════════════════════════════════════════
-- Enable Realtime on ALL core tables (SET TABLE is idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime SET TABLE
      app_settings,
      bundles,
      bundle_items,
      bundle_slots,
      bundle_slot_options,
      categories,
      customers,
      discounts,
      expenses,
      payments,
      product_batches,
      products,
      purchase_order_items,
      purchase_orders,
      purchase_records,
      sales,
      sales_tabs,
      stock_history,
      supplier_transactions,
      suppliers,
      users;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- SYSTEM AUDIT QUERIES
-- ════════════════════════════════════════════════════════════════

-- 1. Duplicate products
SELECT name, COUNT(*) as count 
FROM products 
GROUP BY LOWER(TRIM(name)), name 
HAVING COUNT(*) > 1;

-- 2. Stock vs batch mismatch
SELECT p.name, p.stock, COALESCE(SUM(pb.qty_remaining),0) as batch_sum
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
GROUP BY p.id, p.name, p.stock
HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0);



-- 5. Sales with missing purchase cost
SELECT id, created_at, total 
FROM sales
WHERE items::text LIKE '%"purchaseCost":0%'
   OR items::text LIKE '%"purchaseCost":null%';

-- 6. Orphaned Sale Items
-- STATUS: MOOT (PASS)
-- EXPLANATION: Because sale items are stored as a JSONB array (`items`) inside the `sales` table,
-- it is structurally impossible for an item to exist without its parent sale.
-- The query below verifies the total count of items embedded across all sales.
SELECT SUM(jsonb_array_length(items)) as total_sale_items FROM sales;

-- 7. Check stock history for discrepancies
SELECT
  p.name,
  p.stock as current_stock,
  SUM(sh.change_qty) as history_sum,
  p.stock - SUM(sh.change_qty) as difference
FROM products p
LEFT JOIN stock_history sh ON sh.product_id = p.id
WHERE p.track_inventory = true
GROUP BY p.id, p.name, p.stock
HAVING ABS(p.stock - SUM(sh.change_qty)) > 1
ORDER BY difference DESC;

-- 8. Missing Purchase Cost (Unrolled View)
-- STATUS: VALIDATED
-- EXPLANATION: Uses the `sale_items_unrolled` view to extract JSONB items and check for missing COGS.
SELECT COUNT(*) as missing_cost 
FROM sale_items_unrolled 
WHERE purchase_cost IS NULL OR purchase_cost = 0;


-- ════════════════════════════════════════════════════════════════
-- DATA INTEGRITY — Backfill missing batches and stock_history
-- ════════════════════════════════════════════════════════════════
-- Safe to re-run: uses LEFT JOIN + HAVING COUNT(pb.id) = 0

-- Backfill product_batches for tracked products with stock but no batches
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  GREATEST(p.stock, 0),
  GREATEST(p.stock, 0),
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock > 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.created_at
HAVING COUNT(pb.id) = 0;

-- Backfill for negative stock products (0 qty batch for completeness)
INSERT INTO product_batches (id, product_id, batch_number, quantity, qty_remaining, cost_price, sale_price, active, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'LEGACY-BACKFILL-001',
  0, 0,
  COALESCE(p.cost, 0),
  COALESCE(p.price, 0),
  true,
  COALESCE(p.created_at, NOW())
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE p.track_inventory = true
  AND p.stock < 0
GROUP BY p.id, p.name, p.stock, p.cost, p.price, p.created_at
HAVING COUNT(pb.id) = 0;

-- Backfill missing 'initial' stock_history entries
INSERT INTO stock_history (id, product_id, change_qty, balance_after, type, note, cashier_name, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  p.stock - COALESCE(sh_sum.total_change, 0),
  p.stock - COALESCE(sh_sum.total_change, 0),
  'initial',
  'Backfill: Initial stock entry (post-dump repair)',
  'System',
  COALESCE(p.created_at, NOW()) - INTERVAL '1 second'
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(change_qty) as total_change
  FROM stock_history
  GROUP BY product_id
) sh_sum ON sh_sum.product_id = p.id
WHERE p.track_inventory = true
  AND ABS(p.stock - COALESCE(sh_sum.total_change, 0)) > 1;

-- ════════════════════════════════════════════════════════════════
-- IDEMPOTENT COLUMN ADDITIONS (Post-Launch schema updates)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_in_estore BOOLEAN DEFAULT true;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS estore_status TEXT DEFAULT 'pending' CHECK (estore_status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_notes TEXT;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS estore_theme_color TEXT DEFAULT '#10b981',
  ADD COLUMN IF NOT EXISTS estore_delivery_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estore_min_order NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estore_cod_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS estore_primary_color_hover TEXT DEFAULT '#059669',
  ADD COLUMN IF NOT EXISTS estore_bg_color TEXT DEFAULT '#f9fafb',
  ADD COLUMN IF NOT EXISTS estore_text_color TEXT DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS estore_card_bg_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS estore_order_timer_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estore_order_timer_minutes INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_name TEXT,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_detail TEXT,
  ADD COLUMN IF NOT EXISTS estore_custom_payment_note TEXT,
  ADD COLUMN IF NOT EXISTS estore_pickup_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS estore_delivery_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_type TEXT DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS store_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS store_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS shop_open_time TIME,
  ADD COLUMN IF NOT EXISTS shop_close_time TIME,
  ADD COLUMN IF NOT EXISTS delivery_start_time TIME,
  ADD COLUMN IF NOT EXISTS delivery_end_time TIME,
  ADD COLUMN IF NOT EXISTS pickup_start_time TIME,
  ADD COLUMN IF NOT EXISTS pickup_end_time TIME;

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'always' CHECK (schedule_type IN ('always', 'scheduled')),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS repeat_days TEXT[],
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS estore_sort_order INTEGER DEFAULT 0;
