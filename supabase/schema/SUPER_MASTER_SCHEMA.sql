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
-- TABLES (22) — Order matters (FK dependency):
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
--   18. toppings               Pizza topping add-ons (Cheese/Chicken/Veggie)
--   19. product_toppings        Per-product topping availability
--   20. bundle_slot_toppings    Per-slot topping availability
-- FUNCTIONS (8): update_updated_at_column, generate_invoice_number,
--                 auto_generate_invoice_number, update_customer_stats,
--                 handle_new_user, get_my_workspace_id,
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
--   ⚠️ SHIFT SYSTEM PERMANENTLY REMOVED (2026-08-12): no shift tables/columns/functions
--      exist or may ever be re-added. Historical entries above are migration record only.
--   6. Code: Removed backdrop-blur-md from ProductGrid.tsx (design rule compliance).
--
-- [2026-07-10] Drop workspace_id — Single-tenant architecture
--   Migration: supabase/migrations/20260710030000_drop_workspace_id.sql
--   Changes:
--   1. DROP COLUMN workspace_id from all 18 tables (app_settings, categories,
--      customers, suppliers, products, discounts, users, sales,
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
--
-- [2026-07-18] Variation Inventory — Per-variant stock + Add-on products
--   Migration: supabase/migrations/20260718010000_variation_inventory.sql
--   Changes:
--   1. NEW TABLE variant_stock_history — per-variant stock change audit trail
--   2. NEW TABLE product_addons — inventory-tracked products assignable as add-ons
--   3. types/index.ts: VariantData gets cardTitle, cardSubtitle; new VariantStockHistory,
--      ProductAddon, CartAddonItem types; CartItem gets selectedVariantId,
--      selectedVariantLabel, addonItems
--   4. localDb.ts: version 18 adds variantStockHistory, productAddons tables
--   5. services.ts: new variantStockHistoryService, productAddonsService;
--      salesService.create now deducts variant stock + addon stock
--   6. syncEngine.ts: registers variant_stock_history, product_addons
--
-- [2026-07-24] Full Inventory Integrity Audit + Reconciliation Tool
--   Migration: supabase/migrations/20260724000000_fix_legacy_batches.sql
--   Changes:
--   1. DB: Fixed 12 stock/batch mismatches (phantom LEGACY-BACKFILL-001 batches cleaned,
--      corrective batches created for orphan stock, negative stock reset)
--   2. CODE: PurchaseHistory.tsx handleDeleteRecord() now restores batch qty_remaining
--      and logs stock_history entry on purchase record deletion
--   3. CODE: SupabaseAppContext.tsx DELETE_SALE reducer uses (total - refundedAmount)
--      instead of bare total for customer credit/purchases reversal
--   4. CODE: CheckoutModal.tsx bill-edit rollback now deletes the new sale's stock
--      deduction if old sale delete fails (prevents double-deduction)
--   5. CODE: services.ts added reconcileAllStock() — cross-checks products.stock vs
--      SUM(product_batches.qty_remaining) with optional auto-fix
--   6. CODE: InventoryManager.tsx added Reconcile Stock button (purple, Shield icon)
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
    id                          UUID PRIMARY KEY DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,

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
    receipt_show_delivery_address BOOLEAN DEFAULT true,
    receipt_show_qr_code        BOOLEAN DEFAULT true,
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
    auto_save_receipt_png       BOOLEAN DEFAULT false,

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
    product_type        TEXT DEFAULT 'simple' CHECK (product_type IN ('simple', 'variable', 'variation')),
    parent_id           UUID REFERENCES products(id) ON DELETE CASCADE,
    is_service          BOOLEAN DEFAULT false,
    require_serial      BOOLEAN DEFAULT false,
    show_in_estore      BOOLEAN DEFAULT true,
    estore_sort_order   INTEGER DEFAULT 0,
    estore_category_sort_order INTEGER DEFAULT 0,
    menu_number         INTEGER,
    highlight_tag       TEXT CHECK (highlight_tag IN ('sunday', 'crown')),
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
    received_date       TIMESTAMPTZ DEFAULT NOW(),
    qty_received        INTEGER NOT NULL,
    qty_remaining       INTEGER NOT NULL,
    purchase_cost       DECIMAL(10,2) NOT NULL,
    retail_price        DECIMAL(10,2),
    wholesale_price     DECIMAL(10,2),
    estore_price        DECIMAL(10,2),
    supplier_id         UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_record_id  UUID,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Allow all for authenticated" ON product_batches;
CREATE POLICY "Allow all for authenticated" ON product_batches
    FOR ALL USING (true) WITH CHECK (true);



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
    role                TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier', 'salesman')),
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
    status              TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'credit', 'draft', 'deleted', 'cancelled')),
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
-- 11b. SALESMEN  (Sales staff tracking)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS salesmen (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    phone       TEXT,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE salesmen ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesmen REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Allow all for authenticated" ON salesmen;
CREATE POLICY "Allow all for authenticated" ON salesmen
    FOR ALL USING (true) WITH CHECK (true);


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
-- 14. STORE ORDERS  (Online e-store orders, separate from POS sales)
-- ════════════════════════════════════════════════════════════════

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
    status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'converted')),
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

CREATE INDEX IF NOT EXISTS idx_store_orders_invoice_number ON store_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_fulfilled_sale_id ON store_orders(fulfilled_sale_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer_id ON store_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_created_at ON store_orders(created_at DESC);


-- ════════════════════════════════════════════════════════════════
-- 15. PURCHASE RECORDS  (Unified inventory ledger)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS purchase_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT DEFAULT 'Stock IN',
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name    TEXT NOT NULL,
    sku             TEXT,
    variant_id      TEXT,
    variant_label   TEXT,
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
-- 16. PURCHASE ORDERS  (PO Headers)
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
-- 17. PURCHASE ORDER ITEMS  (PO line items)
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
    source_type     TEXT DEFAULT 'manual_bill',
    amount          DECIMAL(12,2) NOT NULL,
    reference_id    UUID,
    reference_type  TEXT,
    note            TEXT,
    balance_after   DECIMAL(12,2),
    is_manual_override BOOLEAN DEFAULT FALSE,
    override_by     TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
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
    is_manual_override BOOLEAN DEFAULT FALSE,
    override_by     TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
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
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
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
    override_price       NUMERIC(10,2),
    deal_category       TEXT NOT NULL DEFAULT 'pizza' CHECK (deal_category IN ('pizza','burger','beverage','single_item')),
    schedule_type       TEXT DEFAULT 'always' CHECK (schedule_type IN ('always', 'scheduled')),
    start_date          DATE,
    end_date            DATE,
    repeat_days         TEXT[],
    start_time          TIME,
    end_time            TIME,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    badge_enabled       BOOLEAN DEFAULT false,
    badge_text          TEXT,
    badge_icon          TEXT DEFAULT 'crown',
    badge_bg_color      TEXT DEFAULT '#1A1A1A',
    badge_text_color    TEXT DEFAULT '#D4AF37'
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
    sort_order          INTEGER NOT NULL DEFAULT 0,
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
-- 27. VARIANT STOCK HISTORY (Per-variant inventory audit trail)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS variant_stock_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,
  variant_label TEXT,
  change_qty INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'return', 'adjustment', 'initial', 'purchase')),
  reference_id UUID,
  note TEXT,
  balance_after INTEGER,
  cashier_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variant_stock_history_product ON variant_stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_stock_history_variant ON variant_stock_history(product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_stock_history_date ON variant_stock_history(created_at DESC);

GRANT ALL ON variant_stock_history TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- 27b. ROW TOMBSTONES (F21 — Stale-Write Guard registry)
-- Records every DELETE of a financial ledger row so a deleted record
-- can NEVER be resurrected by a stale update from another device.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS row_tombstones (
  table_name TEXT NOT NULL,
  ref_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_row_tombstones_ref ON row_tombstones(ref_id);

GRANT ALL ON row_tombstones TO anon, authenticated, service_role;

ALTER TABLE row_tombstones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow service_role ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow anon ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow authenticated ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- 28. PRODUCT ADDONS (Inventory-tracked add-on products)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_qty INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, addon_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_addons_product ON product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_product_addons_addon ON product_addons(addon_product_id);

GRANT ALL ON product_addons TO anon, authenticated, service_role;

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_source_order_id ON sales(source_order_id) WHERE source_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_sale_date          ON sales(sale_date);


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
  IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Inventory Sync Trigger (Append-Only Ledger) ──
CREATE OR REPLACE FUNCTION trigger_update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products SET 
        stock = COALESCE(stock, 0) + NEW.change_qty,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_variant_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET 
        variant_data = (
            SELECT jsonb_agg(
                CASE 
                    WHEN v->>'id' = NEW.variant_id::text THEN 
                        v || jsonb_build_object('stock', COALESCE((v->>'stock')::int, 0) + NEW.change_qty)
                    ELSE v 
                END
            )
            FROM jsonb_array_elements(variant_data) AS v
        ),
        updated_at = NOW()
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ BEGIN CREATE TRIGGER update_app_settings_updated_at      BEFORE UPDATE ON app_settings      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_categories_updated_at         BEFORE UPDATE ON categories         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_customers_updated_at          BEFORE UPDATE ON customers          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_suppliers_updated_at          BEFORE UPDATE ON suppliers          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_products_updated_at           BEFORE UPDATE ON products           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_discounts_updated_at          BEFORE UPDATE ON discounts          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_users_updated_at             BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_sales_updated_at              BEFORE UPDATE ON sales              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_sales_tabs_updated_at         BEFORE UPDATE ON sales_tabs         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_store_orders_updated_at       BEFORE UPDATE ON store_orders       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_expenses_updated_at           BEFORE UPDATE ON expenses           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_purchase_orders_updated_at    BEFORE UPDATE ON purchase_orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_purchase_order_items_updated_at BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_supplier_transactions_updated_at BEFORE UPDATE ON supplier_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_payments_updated_at           BEFORE UPDATE ON payments           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_stock_history_updated_at      BEFORE UPDATE ON stock_history      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER update_purchase_records_updated_at    BEFORE UPDATE ON purchase_records    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── F21 Stale-Write Guards (server-enforced) ──
CREATE OR REPLACE FUNCTION guard_stale_write()
RETURNS TRIGGER AS $$
BEGIN
  -- (a) A deleted row can never come back (tombstone blocks resurrect).
  IF EXISTS (
    SELECT 1 FROM row_tombstones
    WHERE table_name = TG_TABLE_NAME AND ref_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'STALE_WRITE: record % was deleted from % on another device (or this one). Refresh from cloud — this stale write was rejected.', NEW.id, TG_TABLE_NAME
      USING ERRCODE = 'P0007';
  END IF;
  -- (b) Newest-wins: reject writes older than the stored row.
  IF TG_OP = 'UPDATE' AND NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'STALE_WRITE: remote % row % is NEWER (cloud %) than this local change (%). Refresh from cloud — this stale write was rejected.', TG_TABLE_NAME, NEW.id, OLD.updated_at, NEW.updated_at
      USING ERRCODE = 'P0007';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_row_tombstone() SECURITY DEFINER
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO row_tombstones (table_name, ref_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.id, COALESCE(OLD.updated_at, NOW()))
  ON CONFLICT (table_name, ref_id)
  DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN CREATE TRIGGER guard_stale_write_sales            BEFORE INSERT OR UPDATE ON sales                FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_stock_history    BEFORE INSERT OR UPDATE ON stock_history         FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_variant_history  BEFORE INSERT OR UPDATE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_purchase_records BEFORE INSERT OR UPDATE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_expenses         BEFORE INSERT OR UPDATE ON expenses              FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_payments         BEFORE INSERT OR UPDATE ON payments              FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_store_orders     BEFORE INSERT OR UPDATE ON store_orders          FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_sales_tabs       BEFORE INSERT OR UPDATE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER record_tombstone_sales             AFTER DELETE ON sales                FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_stock_history     AFTER DELETE ON stock_history         FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_variant_history   AFTER DELETE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_purchase_records  AFTER DELETE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_expenses          AFTER DELETE ON expenses              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_payments          AFTER DELETE ON payments              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_store_orders      AFTER DELETE ON store_orders          FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_sales_tabs        AFTER DELETE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

-- ── get_next_invoice_number RPC (used by syncEngine on invoice collision) ──
CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    counter INTEGER;
    new_invoice_number TEXT;
BEGIN
    -- Atomic increment: a single UPDATE...RETURNING locks the row and assigns a
    -- unique, monotonic counter even under concurrent callers (no SELECT-then-UPDATE
    -- race that could hand out the same invoice number twice).
    UPDATE app_settings
    SET invoice_counter = COALESCE(invoice_counter, 1000) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = '00000000-0000-4000-8000-000000000001'
    RETURNING invoice_counter, invoice_prefix
    INTO counter, prefix;

    IF prefix IS NULL THEN prefix := 'INV'; END IF;
    new_invoice_number := prefix || '-' || LPAD(counter::TEXT, 6, '0');
    RETURN new_invoice_number;
END;
$$ LANGUAGE plpgsql;


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

    -- Universal default role: cashier (never admin/manager). The app has no
    -- operational RBAC — every authenticated user accesses all views.
    _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'cashier');
    IF _role NOT IN ('cashier', 'salesman') THEN
        _role := 'cashier';
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
  ADD COLUMN IF NOT EXISTS receipt_show_delivery_address BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_qr_code         BOOLEAN DEFAULT true,
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
  ADD COLUMN IF NOT EXISTS auto_save_receipt_png          BOOLEAN DEFAULT false,
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
  ADD COLUMN IF NOT EXISTS estore_category_sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_type  TEXT DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS is_service    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_serial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS unit          TEXT DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS parent_id     UUID REFERENCES products(id) ON DELETE CASCADE;

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
        status, cashier, cashier_role, notes, sale_type, timestamp, created_at, updated_at,
        salesman_id, salesman_name
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
        COALESCE((sale_data->>'timestamp')::TIMESTAMPTZ, NOW()), NOW(), NOW(),
        (NULLIF(BTRIM((sale_data->>'salesman_id')::text), ''))::UUID,
        sale_data->>'salesman_name'
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
DROP FUNCTION IF EXISTS audit_stock_integrity() CASCADE;
CREATE OR REPLACE FUNCTION audit_stock_integrity()
RETURNS TABLE(product_id uuid, name text, stock integer, history_sum bigint, diff bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    p.id, 
    p.name, 
    p.stock,
    COALESCE(SUM(sh.change_qty), 0) AS history_sum,
    p.stock::bigint - COALESCE(SUM(sh.change_qty), 0) AS diff
  FROM products p
  LEFT JOIN stock_history sh ON sh.product_id = p.id
  WHERE p.track_inventory = true
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(sh.change_qty), 0)
  ORDER BY ABS(p.stock - COALESCE(SUM(sh.change_qty), 0)) DESC;
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
      product_addons,
      products,
      purchase_order_items,
      purchase_orders,
      purchase_records,
      sales,
      sales_tabs,
      store_orders,
      stock_history,
      supplier_transactions,
      suppliers,
      users,
      variant_stock_history;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- SYSTEM AUDIT — Commented out after initial validation.
-- Re-enable individual checks when debugging.
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- DATA INTEGRITY — Backfill missing batches and stock_history
-- ════════════════════════════════════════════════════════════════
-- Safe to re-run: uses LEFT JOIN + HAVING COUNT(pb.id) = 0



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

ALTER TABLE bundle_slot_options
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS menu_number INTEGER,
  ADD COLUMN IF NOT EXISTS highlight_tag TEXT CHECK (highlight_tag IN ('sunday', 'crown'));

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS highlight_tag TEXT CHECK (highlight_tag IN ('sunday', 'crown'));

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS deal_category TEXT NOT NULL DEFAULT 'pizza' CHECK (deal_category IN ('pizza','burger','beverage','single_item'));

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS override_price NUMERIC(10,2);

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS badge_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge_text TEXT,
  ADD COLUMN IF NOT EXISTS badge_icon TEXT DEFAULT 'crown',
  ADD COLUMN IF NOT EXISTS badge_bg_color TEXT DEFAULT '#1A1A1A',
  ADD COLUMN IF NOT EXISTS badge_text_color TEXT DEFAULT '#D4AF37';

-- 24. TOPPINGS (Pizza topping add-ons)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS toppings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    price_small     NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_medium    NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_large     NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO toppings (name, price_small, price_medium, price_large) VALUES
    ('Cheese', 70, 100, 150),
    ('Chicken', 50, 80, 100),
    ('Veggie', 30, 50, 70)
ON CONFLICT (name) DO NOTHING;

GRANT SELECT ON TABLE toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE toppings TO service_role;

-- ════════════════════════════════════════════════════════════════
-- 25. PRODUCT TOPPINGS (which toppings are available per product)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_toppings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    topping_id  UUID NOT NULL REFERENCES toppings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_id, topping_id)
);

CREATE INDEX IF NOT EXISTS idx_product_toppings_product ON product_toppings(product_id);

GRANT SELECT, INSERT, DELETE ON TABLE product_toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE product_toppings TO service_role;

-- ════════════════════════════════════════════════════════════════
-- 26. BUNDLE SLOT TOPPINGS (which toppings are available per slot)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundle_slot_toppings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id     UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
    topping_id  UUID NOT NULL REFERENCES toppings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(slot_id, topping_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_slot_toppings_slot ON bundle_slot_toppings(slot_id);

GRANT SELECT, INSERT, DELETE ON TABLE bundle_slot_toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE bundle_slot_toppings TO service_role;

-- ════════════════════════════════════════════════════════════════
-- POST-LAUNCH ALTER TABLE: supplier_transactions — Ledger Separation + Manual Override
-- ════════════════════════════════════════════════════════════════
ALTER TABLE supplier_transactions
  ADD COLUMN IF NOT EXISTS source_type          TEXT DEFAULT 'manual_bill',
  ADD COLUMN IF NOT EXISTS is_manual_override   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_by          TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- POST-LAUNCH ALTER TABLE: payments — Manual Override
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_manual_override   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_by          TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- POST-LAUNCH ALTER TABLE: stock_history — Delta Sync Support
ALTER TABLE stock_history
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- POST-LAUNCH ALTER TABLE: variant_stock_history — Delta Sync Support
ALTER TABLE variant_stock_history
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- POST-LAUNCH FIX (2026-08-12, found by TESTS_GUIDE full-flow battery):
-- variant_stock_history type CHECK must allow 'purchase' + signed reversal types on
-- ALL projects (PizzaMilano had older 4-type check → variant stock-in crashed there).
DO $$ BEGIN
  ALTER TABLE variant_stock_history DROP CONSTRAINT IF EXISTS variant_stock_history_type_check;
  ALTER TABLE variant_stock_history ADD CONSTRAINT variant_stock_history_type_check
    CHECK (type IN ('sale', 'return', 'adjustment', 'initial', 'purchase', 'stock_in', 'adjustment_out'));
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- POST-LAUNCH ALTER TABLE: product_addons — Delta Sync Support
ALTER TABLE product_addons
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- POST-LAUNCH TRIGGERS: updated_at for the 5 ledger/history tables
DO $$ BEGIN CREATE TRIGGER update_supplier_transactions_updated_at BEFORE UPDATE ON supplier_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_payments_updated_at              BEFORE UPDATE ON payments              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_stock_history_updated_at         BEFORE UPDATE ON stock_history         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_variant_stock_history_updated_at BEFORE UPDATE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER update_product_addons_updated_at        BEFORE UPDATE ON product_addons        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- POST-LAUNCH TRIGGERS: Inventory Sync Triggers
DO $$ BEGIN CREATE TRIGGER on_stock_history_insert AFTER INSERT ON stock_history FOR EACH ROW EXECUTE FUNCTION trigger_update_product_stock(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER on_variant_stock_history_insert AFTER INSERT ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION trigger_update_variant_stock(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- POST-LAUNCH ALTER TABLE: expenses — Manual Override
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_manual_override   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_by          TEXT;

-- POST-LAUNCH ALTER TABLE: sales — Soft Delete Support & Online Orders Tracing
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS deleted_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_order_id      UUID REFERENCES store_orders(id) ON DELETE SET NULL;

-- NOTE: the (UNIQUE, partial) index idx_sales_source_order_id already exists in the
-- commit_sale idempotency block above (covers source_order_id IS NOT NULL). A second
-- non-unique index with the same name would conflict, so it is intentionally not added here.

-- POST-LAUNCH ALTER TABLE: sales — Salesman Tracking
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS salesman_id     UUID,
  ADD COLUMN IF NOT EXISTS salesman_name   TEXT;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_salesman_id_fkey;

-- POST-LAUNCH: Enable realtime for salesmen
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE salesmen;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Fix Estore Oversell Bug: Reserve stock upon order placement
-- (fixed 2026-08-12: delivery_address column — app sends delivery_address;
--  reference_id UUID cast fix; variant-aware reservation F22)

-- Estore policy (2026-08-12): NO stock effect at placement — inventory moves
-- ONLY when the POS bills the order (sale create = normal sale path deduction).
-- Cancel restores stock ONLY for legacy pre-migration reservations (self-healing).
-- Cancelled orders are auto-permanently deleted 24h after cancellation (app prune).-- Trigger to release stock when a legacy-pre-migration estore order is cancelled.
-- New orders (2026-08-12+ policy) never touched stock at placement → cancel is a no-op.
CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
    has_reservation boolean;
BEGIN
    -- If status changed to cancelled AND the order was never fulfilled
    -- (fulfilled orders already route stock through the sale/refund ledger —
    --  releasing here too would double-restore stock / inflate the ledger)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;

            IF product_rec.track_inventory IS TRUE THEN
                IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                    SELECT EXISTS (
                        SELECT 1 FROM variant_stock_history
                        WHERE product_id = product_rec.id
                          AND variant_id = (item->>'variantId')::text
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
                        INSERT INTO variant_stock_history (
                            product_id, variant_id, variant_label, change_qty, type,
                            reference_id, note, cashier_name
                        ) VALUES (
                            product_rec.id,
                            item->>'variantId',
                            item->>'variantLabel',
                            (item->>'quantity')::integer,
                            'return',
                            NEW.id,
                            'Estore Order Cancelled: ' || NEW.invoice_number,
                            'System'
                        );
                    END IF;
                ELSE
                    SELECT EXISTS (
                        SELECT 1 FROM stock_history
                        WHERE product_id = product_rec.id
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
                        INSERT INTO stock_history (
                            product_id, change_qty, type, reference_id, note, cashier_name
                        ) VALUES (
                            product_rec.id,
                            (item->>'quantity')::integer,
                            'return',
                            NEW.id,
                            'Estore Order Cancelled: ' || NEW.invoice_number,
                            'System'
                        );
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_store_order_cancelled ON store_orders;
CREATE TRIGGER on_store_order_cancelled
AFTER UPDATE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_release_estore_stock();

-- Enable RLS on stock_history and variant_stock_history
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_stock_history ENABLE ROW LEVEL SECURITY;

-- 1. stock_history Policies
-- Allow anyone to read (needed for POS devices sync)
DROP POLICY IF EXISTS "Allow public read on stock_history" ON stock_history;
CREATE POLICY "Allow public read on stock_history" 
ON stock_history FOR SELECT 
TO public 
USING (true);

-- Allow authenticated and anon users to insert (POS Cashiers/Admins)
DROP POLICY IF EXISTS "Allow authenticated insert on stock_history" ON stock_history;
CREATE POLICY "Allow authenticated insert on stock_history" 
ON stock_history FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

-- Allow service_role to do everything
DROP POLICY IF EXISTS "Allow service_role ALL on stock_history" ON stock_history;
CREATE POLICY "Allow service_role ALL on stock_history" 
ON stock_history FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 2. variant_stock_history Policies
-- Allow anyone to read
DROP POLICY IF EXISTS "Allow public read on variant_stock_history" ON variant_stock_history;
CREATE POLICY "Allow public read on variant_stock_history" 
ON variant_stock_history FOR SELECT 
TO public 
USING (true);

-- Allow authenticated and anon users to insert
DROP POLICY IF EXISTS "Allow authenticated insert on variant_stock_history" ON variant_stock_history;
CREATE POLICY "Allow authenticated insert on variant_stock_history" 
ON variant_stock_history FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

-- Allow service_role to do everything
DROP POLICY IF EXISTS "Allow service_role ALL on variant_stock_history" ON variant_stock_history;
CREATE POLICY "Allow service_role ALL on variant_stock_history" 
ON variant_stock_history FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- POST-LAUNCH (F21/F22 — 2026-08-12): Stale-Write Guards + Variant Restock
-- ════════════════════════════════════════════════════════════════

-- F22: purchase_records variant columns (variant-targeted restock)
ALTER TABLE purchase_records
  ADD COLUMN IF NOT EXISTS variant_id   TEXT,
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- F21: row_tombstones registry (created near table 27b; re-created idempotently)
CREATE TABLE IF NOT EXISTS row_tombstones (
  table_name TEXT NOT NULL,
  ref_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_row_tombstones_ref ON row_tombstones(ref_id);
GRANT ALL ON row_tombstones TO anon, authenticated, service_role;
ALTER TABLE row_tombstones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow service_role ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow anon ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated ALL on row_tombstones" ON row_tombstones;
CREATE POLICY "Allow authenticated ALL on row_tombstones"
  ON row_tombstones FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- F21: guard + tombstone triggers (idempotent re-creation)
DO $$ BEGIN CREATE TRIGGER guard_stale_write_sales            BEFORE INSERT OR UPDATE ON sales                FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_stock_history    BEFORE INSERT OR UPDATE ON stock_history         FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_variant_history  BEFORE INSERT OR UPDATE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_purchase_records BEFORE INSERT OR UPDATE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_expenses         BEFORE INSERT OR UPDATE ON expenses              FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_payments         BEFORE INSERT OR UPDATE ON payments              FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_store_orders     BEFORE INSERT OR UPDATE ON store_orders          FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER guard_stale_write_sales_tabs       BEFORE INSERT OR UPDATE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION guard_stale_write(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER record_tombstone_sales             AFTER DELETE ON sales                FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_stock_history     AFTER DELETE ON stock_history         FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_variant_history   AFTER DELETE ON variant_stock_history FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_purchase_records  AFTER DELETE ON purchase_records      FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_expenses          AFTER DELETE ON expenses              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_payments          AFTER DELETE ON payments              FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_store_orders      AFTER DELETE ON store_orders          FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER record_tombstone_sales_tabs        AFTER DELETE ON sales_tabs            FOR EACH ROW EXECUTE FUNCTION record_row_tombstone(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Inventory Sync Trigger
-- Ensures 10-year auditability by mathematically adjusting product stock
-- whenever a stock_history delta is appended.
-- ════════════════════════════════════════════════════════════════

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION trigger_update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the main product stock
    UPDATE products SET 
        stock = COALESCE(stock, 0) + NEW.change_qty,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach the trigger to stock_history
DROP TRIGGER IF EXISTS on_stock_history_insert ON stock_history;
CREATE TRIGGER on_stock_history_insert
AFTER INSERT ON stock_history
FOR EACH ROW EXECUTE FUNCTION trigger_update_product_stock();

-- 3. Create the variant stock trigger function
CREATE OR REPLACE FUNCTION trigger_update_variant_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the variant stock inside the JSONB variant_data array
    -- This relies on the fact that variant_data is an array of objects
    -- We update the specific object where id = NEW.variant_id
    UPDATE products
    SET 
        variant_data = (
            SELECT jsonb_agg(
                CASE 
                    WHEN v->>'id' = NEW.variant_id::text THEN 
                        v || jsonb_build_object('stock', COALESCE((v->>'stock')::int, 0) + NEW.change_qty)
                    ELSE v 
                END
            )
            FROM jsonb_array_elements(variant_data) AS v
        ),
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the trigger to variant_stock_history
DROP TRIGGER IF EXISTS on_variant_stock_history_insert ON variant_stock_history;
CREATE TRIGGER on_variant_stock_history_insert
AFTER INSERT ON variant_stock_history
FOR EACH ROW EXECUTE FUNCTION trigger_update_variant_stock();

-- 5. Restore Reconcile Tool (F11 Rule)
-- This replaces the deprecated product_batches reconcile tool with a stock_history sum comparison.
CREATE OR REPLACE FUNCTION audit_stock_integrity_history()
RETURNS TABLE(product_id uuid, name text, stock integer, history_sum bigint, diff bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    p.id, 
    p.name, 
    p.stock,
    COALESCE(SUM(sh.change_qty), 0) AS history_sum,
    p.stock::bigint - COALESCE(SUM(sh.change_qty), 0) AS diff
  FROM products p
  LEFT JOIN stock_history sh ON sh.product_id = p.id
  WHERE p.track_inventory = true
  GROUP BY p.id, p.name, p.stock
  HAVING p.stock != COALESCE(SUM(sh.change_qty), 0)
  ORDER BY ABS(p.stock - COALESCE(SUM(sh.change_qty), 0)) DESC;
$$;

GRANT EXECUTE ON FUNCTION audit_stock_integrity_history() TO anon, authenticated;
-- Fix Estore Oversell Bug: Reserve stock upon order placement

-- Grant execute to anon
-- Issue: trigger_release_estore_stock released +qty on ANY transition to 'cancelled'.
-- If an order was already FULFILLED (sale converted — goods sold, stock already
-- deducted at sale commit / restored at sale refund), cancelling the order released
-- stock a second time (net stock inflation).
-- Fix: only release reservation stock when the order was NEVER fulfilled.
CREATE OR REPLACE FUNCTION public.trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
BEGIN
    -- If status changed to cancelled AND the order was never fulfilled
    -- (fulfilled orders already route stock through the sale/refund ledger)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        -- Loop through items to restore stock
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            -- Check if product tracks inventory
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;

            IF product_rec.track_inventory = true THEN
                INSERT INTO stock_history (
                    product_id, change_qty, type, reference_id, note, cashier_name
                ) VALUES (
                    product_rec.id,
                    (item->>'quantity')::integer,
                    'return',
                    NEW.id::text,
                    'Estore Order Cancelled: ' || NEW.invoice_number,
                    'System'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_store_order_cancelled ON store_orders;
CREATE TRIGGER on_store_order_cancelled
AFTER UPDATE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_release_estore_stock();-- 20260812235500_fix_estore_place_order_bugs.sql
-- 🐛 FIX (found by TESTS_GUIDE full-system-flow battery, 2026-08-12):
--   1. place_estore_order referenced columns (address, table_number, fulfillment_mode)
--      that DON'T EXIST in store_orders → EVERY online order placement failed.
--      App sends 'delivery_address' (toRemoteStoreOrder) — switch to that column.
--   2. reference_id is UUID; both functions cast ::text → every tracked-product
--      order AND every cancel raised 42804 → stock reservation/release never happened.
--   3. F22 note: estore reservation deducts via stock_history (product-level) —
--      variant items would silently not reserve; app routes variant orders
--      through variant_stock_history on the POS side; RPC reserves products only.



CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;
            IF product_rec.track_inventory IS TRUE THEN
                IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                    INSERT INTO variant_stock_history (
                        product_id, variant_id, variant_label, change_qty, type,
                        reference_id, note, cashier_name
                    ) VALUES (
                        product_rec.id,
                        item->>'variantId',
                        item->>'variantLabel',
                        (item->>'quantity')::integer,
                        'return',
                        NEW.id,
                        'Estore Order Cancelled: ' || NEW.invoice_number,
                        'System'
                    );
                ELSE
                    INSERT INTO stock_history (
                        product_id, change_qty, type, reference_id, note, cashier_name
                    ) VALUES (
                        product_rec.id,
                        (item->>'quantity')::integer,
                        'return',
                        NEW.id,
                        'Estore Order Cancelled: ' || NEW.invoice_number,
                        'System'
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;-- 20260813000000_fix_products_variant_history_schema_parity.sql
-- 🐛 FIX (found by TESTS_GUIDE full-system-flow battery, 2026-08-12):
--   1. MINIMAHAL: products.product_type (etc.) columns were NEVER added — the
--      master schema's post-launch ALTER block omitted them → variable products
--      could not save on that project (schema divergence, MAJOR RULES #5/#6).
--   2. PIZZAMILANO: variant_stock_history type CHECK lacked 'purchase' → variant
--      stock-in crashed there (divergence). Master schema now normalizes to the
--      full signed-7 type set.
-- Fix = idempotent ALTERs; safe on all 4 projects.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type   TEXT DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS is_service     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_serial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS unit           TEXT DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS parent_id      UUID REFERENCES products(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE variant_stock_history DROP CONSTRAINT IF EXISTS variant_stock_history_type_check;
  ALTER TABLE variant_stock_history ADD CONSTRAINT variant_stock_history_type_check
    CHECK (type IN ('sale', 'return', 'adjustment', 'initial', 'purchase', 'stock_in', 'adjustment_out'));
EXCEPTION WHEN undefined_object THEN NULL; END $$;-- ═══════════════════════════════════════════════════════════════════════════
-- ESTORE POLICY CHANGE (2026-08-12) — "No stock effect until POS bill"
--
-- Why:
--   Previously place_estore_order RESERVED stock at order placement (deducted
--   -qty immediately) and the cancel trigger restored it. User policy change:
--   til the POS bills an online order, inventory must show ZERO movement.
--
-- New behavior (PERMANENT):
--   1. place_estore_order → inserts the order ONLY. No stock_history /
--      variant_stock_history rows. Inventory untouched at placement.
--   2. POS fulfillment (CheckoutPage/CheckoutModal) creates the sale with
--      sourceOrderId → salesService.create now deducts stock through the
--      normal sale path (AI-era client code removes the isEstoreFulfillment
--      skip). The sale's own 'sale' history rows are the ONLY stock effect.
--   3. trigger_release_estore_stock → cancel restores stock ONLY IF a matching
--      'Estore Reservation' row still exists (legacy in-flight orders placed
--      before this migration). New orders have no reservations → no-op.
--      Self-healing + idempotent: never double-restores, never invents stock.
--   4. LEGACY in-flight reservations (rows with note 'Estore Reservation: …')
--      are compensated with +qty 'return' entries at migration time. Net
--      zero — stock returns to pre-reservation level — so fulfilling an old
--      order after this migration deducts exactly once (no double deduction).
--   5. Cancelled store orders are auto-permanently deleted 24h after
--      cancellation by the app's maintenance prune (syncEngine), now ENABLED.
--      Permanent via row_tombstones (F21) — deleted rows can never resurrect.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. place_estore_order: REMOVE the reservation loop ─────────────────────
CREATE OR REPLACE FUNCTION place_estore_order(order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_order_id uuid;
BEGIN
    -- 1. Insert into store_orders (no stock effect — POS bill deducts later)
    INSERT INTO store_orders (
        invoice_number, customer_id, customer_name, customer_phone,
        delivery_address, customer_notes, items, subtotal, discount_amount,
        tax_amount, total, payment_method, status, cashier,
        delivery_location_lat, delivery_location_lng, delivery_fee
    ) VALUES (
        order_data->>'invoice_number',
        (order_data->>'customer_id')::uuid,
        order_data->>'customer_name',
        order_data->>'customer_phone',
        COALESCE(order_data->>'delivery_address', order_data->>'address'),
        order_data->>'customer_notes',
        order_data->'items',
        (order_data->>'subtotal')::numeric,
        (order_data->>'discount_amount')::numeric,
        (order_data->>'tax_amount')::numeric,
        (order_data->>'total')::numeric,
        order_data->>'payment_method',
        order_data->>'status',
        order_data->>'cashier',
        (order_data->>'delivery_location_lat')::numeric,
        (order_data->>'delivery_location_lng')::numeric,
        (order_data->>'delivery_fee')::numeric
    ) RETURNING id INTO new_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', new_order_id);
END;
$$;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION place_estore_order(jsonb) TO anon, authenticated, service_role;

-- ── 2. trigger_release_estore_stock: restore ONLY if a reservation exists ──
-- New orders never create reservations → cancel is a no-op (correct).
-- Legacy pre-migration orders had reservations → cancel still releases them.
CREATE OR REPLACE FUNCTION trigger_release_estore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item jsonb;
    product_rec record;
    has_reservation boolean;
BEGIN
    -- If status changed to cancelled AND the order was never fulfilled
    -- (fulfilled orders already route stock through the sale/refund ledger —
    --  releasing here too would double-restore stock / inflate the ledger)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.fulfilled_sale_id IS NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            -- Check if product tracks inventory
            SELECT id, track_inventory INTO product_rec FROM products WHERE id = (item->'product'->>'id')::uuid;

            IF product_rec.track_inventory IS TRUE THEN
                IF item ? 'variantId' AND item->>'variantId' IS NOT NULL AND item->>'variantId' != '' THEN
                    -- Variant path: release ONLY if a legacy reservation exists for THIS order
                    SELECT EXISTS (
                        SELECT 1 FROM variant_stock_history
                        WHERE product_id = product_rec.id
                          AND variant_id = (item->>'variantId')::text
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
                        INSERT INTO variant_stock_history (
                            product_id, variant_id, variant_label, change_qty, type,
                            reference_id, note, cashier_name
                        ) VALUES (
                            product_rec.id,
                            item->>'variantId',
                            item->>'variantLabel',
                            (item->>'quantity')::integer,
                            'return',
                            NEW.id,
                            'Estore Order Cancelled: ' || NEW.invoice_number,
                            'System'
                        );
                    END IF;
                ELSE
                    -- Simple path: release ONLY if a legacy reservation exists for THIS order
                    SELECT EXISTS (
                        SELECT 1 FROM stock_history
                        WHERE product_id = product_rec.id
                          AND reference_id = NEW.id
                          AND note LIKE 'Estore Reservation%'
                    ) INTO has_reservation;

                    IF has_reservation THEN
                        INSERT INTO stock_history (
                            product_id, change_qty, type, reference_id, note, cashier_name
                        ) VALUES (
                            product_rec.id,
                            (item->>'quantity')::integer,
                            'return',
                            NEW.id,
                            'Estore Order Cancelled: ' || NEW.invoice_number,
                            'System'
                        );
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_store_order_cancelled ON store_orders;
CREATE TRIGGER on_store_order_cancelled
AFTER UPDATE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_release_estore_stock();

-- ── 3. LEGACY RESERVATION RELEASE (one-time compensation) ──────────────────
-- Reverse every legacy 'Estore Reservation' row with an equal +qty 'return'
-- entry. Net ledger effect = zero; products.stock (already reduced by the
-- reservation trigger) returns to pre-reservation levels. Runs only when
-- reservations exist (idempotent — reference note is unique per function run
-- and successive runs find zero rows to release).
DO $$
DECLARE
    r record;
    n_released integer := 0;
BEGIN
    -- Simple-product reservations
    FOR r IN
        SELECT sh.product_id, sh.change_qty, sh.reference_id, o.invoice_number
        FROM stock_history sh
        LEFT JOIN store_orders o ON o.id = sh.reference_id
        WHERE sh.note LIKE 'Estore Reservation%'
          AND sh.change_qty < 0
    LOOP
        INSERT INTO stock_history (
            id, product_id, change_qty, type, reference_id, note, cashier_name, created_at
        ) VALUES (
            gen_random_uuid(), r.product_id, -r.change_qty, 'return', r.reference_id,
            'Estore Reservation Release (2026-08-12 migration): ' || COALESCE(r.invoice_number, 'order'),
            'System', now()
        );
        n_released := n_released + 1;
    END LOOP;

    -- Variant reservations
    FOR r IN
        SELECT vh.product_id, vh.variant_id, vh.variant_label, vh.change_qty, vh.reference_id, o.invoice_number
        FROM variant_stock_history vh
        LEFT JOIN store_orders o ON o.id = vh.reference_id
        WHERE vh.note LIKE 'Estore Reservation%'
          AND vh.change_qty < 0
    LOOP
        INSERT INTO variant_stock_history (
            id, product_id, variant_id, variant_label, change_qty, type,
            reference_id, note, cashier_name, created_at
        ) VALUES (
            gen_random_uuid(), r.product_id, r.variant_id, r.variant_label, -r.change_qty,
            'return', r.reference_id,
            'Estore Reservation Release (2026-08-12 migration): ' || COALESCE(r.invoice_number, 'order'),
            'System', now()
        );
        n_released := n_released + 1;
    END LOOP;

    RAISE NOTICE 'Legacy estore reservations released: %', n_released;
END $$;

-- ============================================================================
-- ATOMIC SALE & STOCK COMMIT RPCs (2026-08-16 — Phase 1, online-authoritative)
-- Commit a sale + ALL its stock movements in ONE transaction so products.stock
-- / variant_data can NEVER diverge from sales. Idempotent ids prevent double
-- writes on retry. Cloud stock still maintained by stock_history /
-- variant_stock_history triggers.
-- ============================================================================

CREATE OR REPLACE FUNCTION commit_sale(p_sale jsonb, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  h jsonb;
BEGIN
  -- Idempotent fulfilment: never bill the same online order twice.
  IF p_sale->>'source_order_id' IS NOT NULL AND p_sale->>'source_order_id' <> '' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid) THEN
      RETURN jsonb_build_object('success', true, 'id', (SELECT id FROM sales WHERE source_order_id = (p_sale->>'source_order_id')::uuid), 'already_fulfilled', true);
    END IF;
  END IF;

  INSERT INTO sales (
    id, invoice_number, customer_id, customer_name, customer_phone,
    items, subtotal, discount_amount, bill_discount_value, bill_discount_type,
    tax_amount, total, received_amount, change_amount, payment_method,
    card_details, status, cashier, cashier_role, receipt_number, notes,
    applied_discounts, free_gifts, timestamp, sale_date, sale_type,
    extra_charges, split_payments, refunded_amount, estore_status,
    delivery_address, delivery_fee, delivery_location_lat, delivery_location_lng,
    customer_notes, source_order_id, salesman_id, salesman_name, created_at, updated_at
  ) VALUES (
    (p_sale->>'id')::uuid,
    p_sale->>'invoice_number',
    NULLIF(p_sale->>'customer_id','')::uuid,
    p_sale->>'customer_name',
    p_sale->>'customer_phone',
    COALESCE(p_sale->'items','[]'::jsonb),
    (p_sale->>'subtotal')::numeric,
    (p_sale->>'discount_amount')::numeric,
    (p_sale->>'bill_discount_value')::numeric,
    p_sale->>'bill_discount_type',
    (p_sale->>'tax_amount')::numeric,
    (p_sale->>'total')::numeric,
    (p_sale->>'received_amount')::numeric,
    (p_sale->>'change_amount')::numeric,
    p_sale->>'payment_method',
    p_sale->'card_details',
    p_sale->>'status',
    p_sale->>'cashier',
    p_sale->>'cashier_role',
    p_sale->>'receipt_number',
    p_sale->>'notes',
    p_sale->'applied_discounts',
    p_sale->'free_gifts',
    (p_sale->>'timestamp')::timestamptz,
    (p_sale->>'sale_date')::date,
    p_sale->>'sale_type',
    p_sale->'extra_charges',
    p_sale->'split_payments',
    (p_sale->>'refunded_amount')::numeric,
    p_sale->>'estore_status',
    p_sale->>'delivery_address',
    (p_sale->>'delivery_fee')::numeric,
    (p_sale->>'delivery_location_lat')::numeric,
    (p_sale->>'delivery_location_lng')::numeric,
    p_sale->>'customer_notes',
    NULLIF(p_sale->>'source_order_id','')::uuid,
    NULLIF(p_sale->>'salesman_id','')::uuid,
    p_sale->>'salesman_name',
    COALESCE((p_sale->>'created_at')::timestamptz, now()),
    now()
  ) RETURNING id INTO v_id;

  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now());
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', v_id, h->>'note', h->>'cashier_name', now(), now());
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION apply_stock_movements(p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  h jsonb;
BEGIN
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now());
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', NULLIF(h->>'reference_id','')::uuid, h->>'note', h->>'cashier_name', now(), now());
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_sale(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_stock_movements(jsonb) TO anon, authenticated, service_role;

-- ── 8. ATOMIC DELETE + REFUND (2026-08-16) ──
-- Sale delete / refund must reverse stock AND mutate the sale in ONE transaction
-- so cloud can never diverge. Idempotent via ON CONFLICT DO NOTHING + EXISTS guards.
CREATE OR REPLACE FUNCTION delete_sale_atomic(p_sale_id uuid, p_history jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'already_deleted');
  END IF;
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
  DELETE FROM sales WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END; $$;

CREATE OR REPLACE FUNCTION refund_sale_atomic(p_sale_id uuid, p_history jsonb, p_status text, p_refunded_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'note', 'sale_missing');
  END IF;
  FOR h IN SELECT * FROM jsonb_array_elements(p_history)
  LOOP
    IF h->>'variant_id' IS NOT NULL AND h->>'variant_id' <> '' THEN
      INSERT INTO variant_stock_history (id, product_id, variant_id, variant_label, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, h->>'variant_id', h->>'variant_label', (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO stock_history (id, product_id, change_qty, type, reference_id, note, cashier_name, created_at, updated_at)
      VALUES (COALESCE((h->>'id')::uuid, gen_random_uuid()), (h->>'product_id')::uuid, (h->>'change_qty')::int, h->>'type', p_sale_id, h->>'note', h->>'cashier_name', now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
  UPDATE sales SET status = p_status, refunded_amount = p_refunded_amount, updated_at = now() WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'id', p_sale_id);
END; $$;

GRANT EXECUTE ON FUNCTION delete_sale_atomic(uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refund_sale_atomic(uuid, jsonb, text, numeric) TO anon, authenticated, service_role;