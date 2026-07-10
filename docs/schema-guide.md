# 🗄️ Schema Guide — Zaynah's POS

> **For AI Agents & Developers** — How to set up or reconcile the database.

## Overview

The database schema lives in two places:

| File | Purpose |
|------|---------|
| `supabase/schema/SUPER_MASTER_SCHEMA.sql` | **Single source of truth** — Complete DDL for a fresh project |
| `supabase/migrations/*.sql` | Incremental changes applied to an **existing** live database |

---

## 🔵 Scenario A: Fresh Project Setup

Run the full master schema — it's fully idempotent (`CREATE IF NOT EXISTS`, `ALTER PUBLICATION SET TABLE`, etc.):

```bash
SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")"
```

**What it sets up:**
- ✅ 19+ tables with all columns, constraints, defaults, indexes
- ✅ RLS **disabled** — `GRANT ALL` to `anon` + `authenticated` roles
- ✅ Realtime publication with **all** tables
- ✅ Functions: `process_sale`, `process_return`, `audit_stock_integrity`, etc.
- ✅ Seed data: default `app_settings` row
- ✅ UUID extension + pgcrypto

---

## 🟡 Scenario B: Existing Project — Schema Reconciliation

When running against an already-set-up DB, the master schema is **safe to run** (`IF NOT EXISTS` guards prevent data loss). However, reconciliations are best done **manually** for each missing piece.

### Checklist — check each item in order:

### 1. Missing Columns

```sql
-- Check if a column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'app_settings' AND column_name = 'enable_kot_printer';

-- If missing, add it:
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS enable_kot_printer BOOLEAN DEFAULT false;
```

**Columns known to have been added post-launch:**

| Table | Column | Type | Default |
|-------|--------|------|---------|
| `app_settings` | `enable_kot_printer` | BOOLEAN | false |
| `app_settings` | `enable_split_payment` | BOOLEAN | false |
| `app_settings` | `enable_extra_charges` | BOOLEAN | false |
| `app_settings` | `allow_credit_over_limit` | BOOLEAN | true |
| `app_settings` | `pos_grid_columns` | INTEGER | 4 |
| `app_settings` | `barcode_content_scale` | NUMERIC | 1.0 |
| `app_settings` | `barcode_font_size` | INTEGER | 9 |
| `app_settings` | `barcode_name_lines` | INTEGER | 1 |
| `products` | `variant_data` | JSONB | '[]' |
| `products` | `modifiers` | JSONB | '[]' |
| `sales` | `split_payments` | JSONB | '[]' |
| `sales` | `extra_charges` | JSONB | '[]' |

For the **full column list**, search `SUPER_MASTER_SCHEMA.sql` for `CREATE TABLE IF NOT EXISTS`.

### 2. Missing Indexes

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'sales';
-- Compare with the CREATE INDEX block in SUPER_MASTER_SCHEMA.sql
```

**Key indexes to verify:**

| Table | Index Name | Columns |
|-------|-----------|---------|
| sales | idx_sales_timestamp | created_at |
| sales | idx_sales_customer_id | customer_id |
| sales | idx_sales_invoice_number | invoice_number |
| sales | idx_sales_created_at_status | created_at, status |
| products | idx_products_name | name |
| products | idx_products_barcode | barcode |
| product_batches | idx_product_batches_product_id | product_id |
| product_batches | idx_product_batches_expiry | expiry_date |

Full list: search `CREATE INDEX` in `SUPER_MASTER_SCHEMA.sql`.

### 3. Grants / Permissions

```sql
-- Verify anon has ALL on all tables
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name;
```

**Expected:** Every table should show `INSERT`, `SELECT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` for both `anon` and `authenticated`.

Quick fix (from master schema):
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```

### 4. Realtime Publication

```sql
-- Check which tables are in the publication
SELECT pubname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

**Expected tables (21):**
`app_settings`, `bundles`, `bundle_items`, `bundle_slots`, `bundle_slot_options`, `categories`, `customers`, `discounts`, `expenses`, `payments`, `product_batches`, `products`, `purchase_order_items`, `purchase_orders`, `purchase_records`, `sales`, `sales_tabs`, `stock_history`, `supplier_transactions`, `suppliers`, `users`

**Fix if missing:**
```sql
ALTER PUBLICATION supabase_realtime SET TABLE
  app_settings, bundles, bundle_items, bundle_slots, bundle_slot_options,
  categories, customers, discounts, expenses, payments,
  product_batches, products, purchase_order_items, purchase_orders,
  purchase_records, sales, sales_tabs, stock_history,
  supplier_transactions, suppliers, users;
```

### 5. Functions

```sql
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
```

**Expected:** `process_sale`, `process_return`, `audit_stock_integrity`, `audit_missing_purchase_cost`, `resolve_login_email`, `get_email_by_username`, `get_my_workspace_id`, `generate_invoice_number`, `auto_generate_invoice_number`, `update_customer_stats`, `handle_new_user`, `generate_po_number`

Full definitions in `SUPER_MASTER_SCHEMA.sql`.

---

## 🟢 Running the Full Schema on Existing DB (Nuclear Option)

If the DB is too far out of sync, run the **full master schema**. It's designed to be idempotent:

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

**What's safe:**
- `CREATE TABLE IF NOT EXISTS` — won't overwrite existing data
- `CREATE INDEX IF NOT EXISTS` — won't re-create
- `ALTER PUBLICATION SET TABLE` — idempotent
- `GRANT ALL` — no-op if already granted

**What it will do on existing DB:**
- Add any missing columns (only if the table is re-created, which won't happen with `IF NOT EXISTS`)
- ❗ `GRANT ALL ON ALL TABLES` will re-grant (no harm)
- ❗ `DROP POLICY IF EXISTS …` loop will re-create policies (no harm)

> **Note:** `CREATE TABLE IF NOT EXISTS` does **not** alter existing tables — it skips them entirely. So columns added post-launch (like `enable_kot_printer`, `variant_data`) must be added separately via `ALTER TABLE` or migration files.

---

## 📁 Migration Workflow

When adding a new column/table/index:

1. **Create migration file:** `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. **Update master schema:** Add the change to `SUPER_MASTER_SCHEMA.sql` table definition
3. **Run migration via Management API** (see AGENTS.md)
4. **Run full build:** `npm run build`
5. **Log in GEMINI.md** Schema Change Log section

---

## 🔑 Quick Reference: Management API

```bash
# Run SQL
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1"}'

# Get project ref
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```
