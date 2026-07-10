# 🚀 Zaynah's POS — Complete Setup Guide

> **One guide to set up fresh or sync an existing project.**
> `sub update ho jaye` — everything gets updated with a single workflow.

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Fresh Project Setup](#-fresh-project)
4. [Existing Project Sync](#-existing-project-sync)
5. [Reference: Schema Reconciliation](#-reference-schema-reconciliation)
6. [Migration Workflow](#-migration-workflow)
7. [Troubleshooting](#-troubleshooting)

---

## Overview

| Artifact | Purpose |
|----------|---------|
| `supabase/schema/SUPER_MASTER_SCHEMA.sql` | **Single source of truth** — can be run on ANY project (fresh or existing). Fully idempotent. |
| `supabase/migrations/*.sql` | Incremental changes for existing live DBs |
| `.env.local` | Credentials: `SUPABASE_MGMT_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_REF` |
| `AGENTS.md` | Per-agent operating rules (must read first for every session) |
| `docs/UI_RULES.md` | UI/design constraints (must read before any UI work) |

### Architecture

- **1 Clone = 1 Shop** — single-tenant. No workspace_id anywhere.
- **Supabase Management API only** — no Prisma, no direct DB connection strings.
- **Auth**: `anon` key works for all operations (`GRANT ALL` on every table).

---

## 🔵 Fresh Project

> Use this when setting up a brand-new Supabase project.

### Step 1: Create Supabase Project

```bash
# Via Management API
curl -s -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "jeanzone-prod",
    "organization_id": "<org-id>",
    "plan": "pro"
  }'
```

Or create manually via [Supabase Dashboard](https://supabase.com/dashboard).

### Step 2: Get Project Ref & Keys

```bash
# List projects to find your ref
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"

# Get API keys (anon + service_role)
curl -s "https://api.supabase.com/v1/projects/$SUPABASE_REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```

Update `.env.local`:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_MGMT_API_KEY=sbp_...
SUPABASE_REF=<ref>
```

### Step 3: Run Master Schema

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

This single command creates everything:
- ✅ All 19+ tables with all columns, constraints, defaults
- ✅ All indexes
- ✅ All functions (process_sale, process_return, audit_stock_integrity, etc.)
- ✅ All triggers
- ✅ Realtime publication with all tables
- ✅ `GRANT ALL` to `anon` + `authenticated` roles (no RLS)
- ✅ Seed data: default `app_settings` row

### Step 4: Build & Deploy

```bash
npm install
npm run build
# Deploy dist/ to Vercel / Netlify / your host
```

### Step 5: Create Admin User

1. Open the app in browser
2. Sign up with email + password
3. The `handle_new_user()` trigger auto-creates a `public.users` row
4. Set `role = 'admin'` in the DB:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
   ```

---

## 🟡 Existing Project Sync

> Use this when the live DB is out of sync with the master schema.

### Option A: Nuclear — Run Full Schema (Recommended)

The master schema is now **truly idempotent** for existing DBs. Run it as-is:

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

**What happens:**

| Construct | Behavior on Existing DB |
|-----------|------------------------|
| `CREATE TABLE IF NOT EXISTS` | Skipped if table exists |
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` | Adds only missing columns |
| `CREATE INDEX IF NOT EXISTS` | Skipped if index exists |
| `CREATE OR REPLACE FUNCTION` | Replaces function definition |
| `ALTER PUBLICATION SET TABLE` | Idempotent — sets exact table list |
| `GRANT ALL` | No-op if already granted |
| `DROP POLICY IF EXISTS` / `CREATE POLICY` | Safe — re-creates policies |
| Seed data (`INSERT ... ON CONFLICT DO NOTHING`) | Safe — won't overwrite |

**What this fixes in one shot:**
- Missing columns (`enable_kot_printer`, `variant_data`, `split_payments`, etc.)
- Missing indexes
- Missing/outdated functions
- Missing realtime publication tables
- Missing permissions

### Option B: Run Individual Migrations

If you prefer a targeted approach, run migrations in order:

```bash
for f in supabase/migrations/*.sql; do
  SQL=$(cat "$f")
  SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
  echo "→ Running $f..."
  curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$SQL_JSON"
done
```

### Step 3: Verify & Build

```bash
npm run build
# Check dashboard loads correctly
```

---

## 🟢 Reference: Schema Reconciliation

If the nuclear option feels too aggressive, here's how to verify each piece individually.

### 1. Check All Columns

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Compare output with the `CREATE TABLE` blocks in `SUPER_MASTER_SCHEMA.sql`.

**Commonly missing columns:**

| Table | Column | Type | Default | Since |
|-------|--------|------|---------|-------|
| `app_settings` | `enable_kot_printer` | BOOLEAN | false | 2026-07 |
| `app_settings` | `enable_split_payment` | BOOLEAN | false | 2026-05 |
| `app_settings` | `enable_extra_charges` | BOOLEAN | false | 2026-05 |
| `app_settings` | `allow_credit_over_limit` | BOOLEAN | true | 2026-05 |
| `app_settings` | `pos_grid_columns` | INTEGER | 4 | 2026-05 |
| `app_settings` | `barcode_content_scale` | NUMERIC | 1.0 | 2026-05 |
| `app_settings` | `barcode_font_size` | INTEGER | 9 | 2026-05 |
| `app_settings` | `barcode_name_lines` | INTEGER | 1 | 2026-05 |
| `products` | `variant_data` | JSONB | '[]' | 2026-07 |
| `products` | `modifiers` | JSONB | '[]' | 2026-07 |
| `sales` | `split_payments` | JSONB | '[]' | 2026-05 |
| `sales` | `extra_charges` | JSONB | '[]' | 2026-05 |

### 2. Check Indexes

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

**Key indexes:**

| Table | Index | Columns |
|-------|-------|---------|
| sales | `idx_sales_customer_id` | customer_id |
| sales | `idx_sales_invoice_number` | invoice_number |
| sales | `idx_sales_created_at_status` | created_at, status |
| sales | `idx_sales_timestamp` | created_at |
| products | `idx_products_barcode` | barcode |
| products | `idx_products_name` | name |
| product_batches | `idx_product_batches_product_id` | product_id |
| product_batches | `idx_product_batches_expiry` | expiry_date |

### 3. Check Grants

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY grantee, table_name;
```

Fix:
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```

### 4. Check Realtime

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```

**Expected (21 tables):**
`app_settings`, `bundles`, `bundle_items`, `bundle_slots`, `bundle_slot_options`, `categories`, `customers`, `discounts`, `expenses`, `payments`, `product_batches`, `products`, `purchase_order_items`, `purchase_orders`, `purchase_records`, `sales`, `sales_tabs`, `stock_history`, `supplier_transactions`, `suppliers`, `users`

Fix:
```sql
ALTER PUBLICATION supabase_realtime SET TABLE
  app_settings, bundles, bundle_items, bundle_slots, bundle_slot_options,
  categories, customers, discounts, expenses, payments,
  product_batches, products, purchase_order_items, purchase_orders,
  purchase_records, sales, sales_tabs, stock_history,
  supplier_transactions, suppliers, users;
```

### 5. Check Functions

```sql
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
```

**Expected:** `audit_missing_purchase_cost`, `audit_stock_integrity`, `auto_generate_invoice_number`, `generate_invoice_number`, `generate_po_number`, `get_email_by_username`, `get_my_workspace_id`, `handle_new_user`, `process_return`, `process_sale`, `resolve_login_email`, `update_customer_stats`

### 6. Check Seed Data

```sql
SELECT * FROM app_settings;
-- Should have 1 row with id = 00000000-0000-4000-8000-000000000001
```

Fix:
```sql
INSERT INTO app_settings (id) VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
```

---

## 📁 Migration Workflow

When adding a DB change:

1. **Create migration** in `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. **Update master schema** — add column/table to `SUPER_MASTER_SCHEMA.sql` + update the `ALTER TABLE ADD COLUMN IF NOT EXISTS` section for existing-DB safety
3. **Log in changelog** — add entry at top of `SUPER_MASTER_SCHEMA.sql` with date + changes
4. **Run migration** against live DB:
   ```bash
   SQL=$(cat supabase/migrations/20260710220000_add_enable_kot_printer.sql)
   SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d "$SQL_JSON"
   ```
5. **Update local schema** — sync `src/lib/localDb.ts` if needed
6. **Build & verify**: `npm run build`

---

## 🔧 Troubleshooting

### `404 Not Found` for static files on sub-routes

**Cause:** Relative paths in `index.html` (e.g., `href="site.webmanifest"`) resolve to `/settings/site.webmanifest` when on the `/settings` route.

**Fix:** Use absolute paths (`href="/site.webmanifest"`) — already fixed in current code.

### Pages blink on refresh

**Causes:**
1. 404s for static files (see above) — each failed request adds latency
2. Multiple render cycles: blank → local data → sync → remote merge
3. Auth session not ready at first render

**Fixes:**
1. ✅ Already applied: all asset paths now absolute
2. Background color applied inline in `<head>` (before CSS loads) — already done
3. If auth flash persists, check `SupabaseAppContext.tsx` for session recovery logic

### `enable_kot_printer` checkbox shows solid black square

**Cause:** Column missing from DB + `formData` initial state.

**Fix:** Column added via migration + `formData.enableKotPrinter` set to `false` in `Settings.tsx`.

### `Sales query timeout`

**Cause:** No `.order()` or `.limit()` on the fetch-all sales query.

**Fix:** `sales.fetchRemote()` now uses `.order('created_at', { ascending: false }).limit(10000)`.

### `401` from HEAD ping in useSync

**Cause:** HEAD `/rest/v1/` returns 401 because `anon` key needs a table path.

**Fix:** Removed HEAD ping. Now relies on `navigator.onLine` events + visibilitychange.

---

## 🔑 Quick Reference: Management API

```bash
# Run any SQL
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1"}'

# List projects
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"

# Get keys
curl -s "https://api.supabase.com/v1/projects/$SUPABASE_REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```
