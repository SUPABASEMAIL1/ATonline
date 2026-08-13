# 🚀 Zaynah's POS — Complete System Guide

> **One guide to rule them all.** Agent is guide dekh k current system completely run kar sakta hai, aur naya project bhi setup kar sakta hai.
> `sub update ho jaye` — har change ke baad ye guide update karna mandatory hai.

---

## 📑 Table of Contents

1. [System Overview](#-system-overview) — including **MAJOR RULES (non-negotiable)**
2. [Architecture](#-architecture)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Database Schema](#-database-schema)
6. [Services & API Layer](#-services--api-layer)
7. [Sync Engine](#-sync-engine)
8. [Auth Flow](#-auth-flow)
9. [Settings Sync](#-settings-sync)
10. [Component Architecture](#-component-architecture)
11. [Fresh Project Setup](#-fresh-project-setup)
12. [Existing Project Sync](#-existing-project-sync)
13. [Post-Deployment Verification](#-post-deployment-verification)
14. [Migration Workflow](#-migration-workflow)
15. [Troubleshooting](#-troubleshooting)
16. [Development Workflow](#-development-workflow)
17. [Deploy Guide (Cloudflare Pages + Vercel)](#-deploy-guide-cloudflare-pages--vercel)

---

## 🏗 System Overview

Zaynah's POS is a **local-first, single-tenant Point of Sale** system built for retail shops.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **1 Clone = 1 Shop** | Har shop ka apna code clone + apna Supabase project. No multi-tenant complexity |
| **Local-First** | App IndexedDB (Dexie) mein data store karta hai. Cloud sirf backup/sync ke liye |
| **Management API Only** | All DB operations via Supabase Management API (`sbp_` token). No Prisma, no direct connection strings |
| **GRANT ALL** | `anon` role ko har table par full access hai. No RLS checks needed — single-tenant simplicity |
| **Realtime Sync** | Supabase Realtime subscriptions se live updates aate hain across browser tabs |

### ⚠️ MAJOR RULES (NON-NEGOTIABLE — har agent/session ke liye)

| Rule | Detail |
|------|--------|
| **1. Code = UNIVERSAL** | Code kabhi kisi ek shop/business ke liye hardcode nahi hota. Branding, names, niches — sab settings se aate hain (fallback: `POS` / `My Store`). Saare 4 repos par **ek hi codebase** deploy hota hai — koi shop-specific code-changes nahi. Ek feature ek hi jagah fix hota hai, sabko milta hai |
| **2. Env/Credentials HAMESHA `env_backups/` se** | Deploy aur DB operations se pehle `env_backups/` folder zarooor padho (har shop ka apna file: `JEANZONE-ENV`, `ATOLINE-ENV`, `minimahal-pos.env.local`, `.env.local.pizza-milano...`). Credentials **kabhi guess/mix nahi** karte — shop ka naam diya hai to sirf usi shop ka env use karo; "all/sab" kaho to 4 repos push |
| **3. All Fixes → ALL Projects** | Har fix (code, SQL, schema, v1/release) har ek project par apply hota hai — koi project peeche nahi rehta. Deploy ke baad GH Actions + Cloudflare/Vercel + DB verify **zaroori**: bina verify "done" nahi kehte |
| **4. Code 1 — Credentials ALAG-ALAG** | Sabki **code ek jaisi** hai, lekin **har shop ka apna env** hai (Supabase URL/anon/service key, Management API key, Cloudflare account/token). Dusre shop ke credentials kabhi use nahi karte; galat account par project kabhi nahi banate |
| **5. Master Schema = SAME (parity)** | `supabase/schema/SUPER_MASTER_SCHEMA.sql` hi single source of truth — sab 4 projects par **exact same schema** (tables, columns, guards/triggers, functions, constraints, updated_at timestamps). Schema kabhi ek shop par baad mein nahi, sab par ek saath |
| **6. Systems IDENTICAL on all projects** | Har system (F21 stale-write guards, F22 variant ledger, estore, inventory, reports, F23 guard-pattern) har DB par same behavior deta hai. Verify: TEST BATTERY har project par chalao — results **identical** expect (`f21_guards=24`, `tombstones=1`, `functions=7`). Koi divergence = fix zaroori |
| **7. Docs Current** | `docs/SYSTEM_FUNCTIONS_GUIDE.md`, `docs/TESTS_GUIDE.md` (full test battery — koi miss na karo), `docs/MODULES.md`, `docs/UI_RULES.md`, `GEMINI.md` (SCHEMA CHANGE LOG + F-rules), `docs/setup.md` — jo bhi change ho, usi change mein update karo |

> ⚠️ In rules ka ulhan = violation. Agent ka pehla kaam kisi bhi task se pehle: table of contents + MAJOR RULES + env_backups inventory.

### Data Flow

```
User Action → Local State (React Context) → IndexedDB (Dexie) → Sync Engine → Supabase Cloud
                                                                    ↕
                                                          Realtime Subscription ← other tabs/devices
```

1. User POS mein koi action karta hai (sale, product add, etc.)
2. Data pehle **local IndexedDB** mein save hota hai
3. Sync engine background mein **cloud ko update** karta hai
4. Dusre browser tabs ko **Realtime subscription** ke through update milta hai
5. Offline mode mein sirf local kaam karta hai, reconnect pe auto-sync

---

## 🏛 Architecture

### Directory Structure

```
v12.2/
├── src/
│   ├── main.tsx                    # App entry point + PWA SW registration
│   ├── App.tsx                     # Router + global layout
│   ├── index.css                   # Global styles (Tailwind + custom)
│   ├── types/
│   │   └── index.ts                # ALL TypeScript interfaces (Sale, Product, etc.)
│   ├── context/
│   │   └── SupabaseAppContext.tsx   # Global state (useApp hook) + ALL CRUD operations
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client instance
│   │   ├── services.ts             # API service layer (mapSettings, CRUD functions)
│   │   ├── constants.ts            # TABLE_COLUMNS, enum maps
│   │   ├── localDb.ts              # Dexie (IndexedDB) database
│   │   ├── syncEngine.ts           # Background sync logic
│   │   ├── sounds.ts               # Audio feedback (base64 data URIs)
│   │   ├── dialog.tsx              # Global dialog system
│   │   ├── utils.ts                # Utility functions
│   │   ├── currencies.ts           # Currency formatting
│   │   └── dateUtils.ts           # Date/time formatting
│   ├── components/
│   │   ├── pos/                    # Point of Sale UI
│   │   │   ├── POSTerminal.tsx     # Main POS screen
│   │   │   ├── CheckoutPage.tsx    # Checkout flow (payment + receipt)
│   │   │   ├── CheckoutModal.tsx   # Deprecated checkout modal
│   │   │   ├── ReceiptPrint.tsx    # Receipt printing component
│   │   │   ├── KOTPrint.tsx        # Kitchen Order Ticket printing
│   │   │   ├── CompactItemRow.tsx  # Product row in cart
│   │   │   ├── ProductGrid.tsx     # Product grid display
│   │   │   └── Cart.tsx            # Shopping cart
│   │   ├── settings/               # Settings UI
│   │   │   └── Settings.tsx        # All settings (receipt, barcode, KOT, etc.)
│   │   ├── inventory/              # Inventory management
│   │   ├── reports/                # Reports
│   │   ├── customers/              # Customer management
│   │   ├── suppliers/              # Supplier management
│   │   ├── common/                 # Shared components (Modal, HelpTooltip, etc.)
│   │   └── layout/                 # Layout (SyncStatusBadge, etc.)
│   └── hooks/                      # Custom React hooks
│       ├── useSync.ts              # Sync connectivity logic
│       ├── useCartCalculations.ts  # Cart math
│       └── useTranslation.ts       # i18n
├── supabase/
│   ├── schema/
│   │   └── SUPER_MASTER_SCHEMA.sql # SINGLE SOURCE OF TRUTH — full DB DDL
│   └── migrations/
│       └── *.sql                   # Incremental DB changes
├── docs/
│   ├── setup.md                    # THIS FILE — complete system guide
│   ├── supabase-api-guide.md       # Management API reference
│   └── UI_RULES.md                 # Design/UI rules
├── env_backups/                    # .env backups for all shops
│   ├── jeanzone.env.local
│   ├── minimahal-pos.env.local
│   └── .env.local.pizza-milano.20260708_202548
├── index.html                      # SPA entry + inline theme script
├── vercel.json                     # SPA rewrite rules
├── AGENTS.md                       # AI agent operating rules
└── GEMINI.md                       # Master cursor rules
```

### Key Files Deep Dive

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/types/index.ts` | **ALL data types** | `Sale`, `Product`, `AppSettings`, `Customer`, `Supplier`, `Expense`, `Bundle`, `Discount`, etc. |
| `src/context/SupabaseAppContext.tsx` | **Global state hub** | `useApp()` hook, `dispatch`, all create/update/delete operations, localStorage persistence |
| `src/lib/supabase.ts` | **Supabase client** | Singleton client with `Cache-Control: no-cache` headers |
| `src/lib/services.ts` | **Data mapping layer** | `mapSettings()`, `toRemoteSettings()`, `salesService`, `productsService`, etc. |
| `src/lib/constants.ts` | **Column definitions** | `TABLE_COLUMNS` — every table ki columns ki list (sync engine ke liye) |
| `src/lib/localDb.ts` | **IndexedDB (Dexie)** | All local tables, CRUD operations, offline storage |
| `src/lib/syncEngine.ts` | **Background sync** | Syncs local → cloud and cloud → local, conflict resolution |
| `src/hooks/useSync.ts` | **Connectivity** | `navigator.onLine` events, visibilitychange, stale-data detection |

---

## 🛠 Tech Stack

| Technology | Purpose | Version |
|-----------|---------|---------|
| **React 18** | UI framework | 18.x |
| **TypeScript** | Type safety | 5.x |
| **Vite** | Build tool | 5.x |
| **Tailwind CSS** | Styling | 3.x |
| **Dexie.js** | IndexedDB wrapper | 4.x |
| **Supabase JS** | Supabase client | 2.x |
| **React Router** | SPA routing | 6.x |
| **Vite PWA** | Service worker + offline | 0.x |
| **lucide-react** | Icons | latest |

---

## 🗄 Database Schema

### All Tables (21)

| # | Table | Purpose | Key Columns |
|---|-------|---------|-------------|
| 1 | `app_settings` | Singleton config (1 row) | `id`, `store_name`, `tax_rate`, `currency`, `enable_kot_printer`, etc. |
| 2 | `categories` | Product categories | `id`, `name`, `description`, `active` |
| 3 | `customers` | Customer CRM | `id`, `name`, `phone`, `credit_limit`, `credit_used` |
| 4 | `suppliers` | Supplier management | `id`, `name`, `phone`, `opening_balance` |
| 5 | `products` | Inventory master | `id`, `name`, `sku`, `barcode`, `price`, `cost`, `stock`, `variant_data`, `modifiers` |
| 6 | `product_batches` | FIFO batch tracking | `id`, `product_id`, `batch_number`, `qty_remaining`, `cost_price`, `expiry_date` |
| 7 | `discounts` | Discount campaigns | `id`, `name`, `type`, `value`, `conditions`, `free_gift_products` |
| 8 | `users` | Extended auth users | `id`, `username`, `email`, `role`, `permissions` |
| 9 | `sales` | POS invoices | `id`, `invoice_number`, `customer_id`, `items`, `total`, `split_payments`, `extra_charges` |
| 10 | `sales_tabs` | Multi-tab cashier | `id`, `user_id`, `name`, `cart` |
| 11 | `expenses` | Operating costs | `id`, `description`, `amount`, `category` |
| 12 | `purchase_records` | Inventory ledger | `id`, `type`, `product_id`, `quantity`, `cost_price` |
| 13 | `purchase_orders` | PO headers | `id`, `po_number`, `supplier_id`, `status`, `total_amount` |
| 14 | `purchase_order_items` | PO line items | `id`, `po_id`, `product_id`, `quantity`, `cost_price` |
| 15 | `supplier_transactions` | Supplier khata | `id`, `supplier_id`, `type`, `amount`, `balance_after`, `updated_at` |
| 16 | `payments` | Supplier payments | `id`, `supplier_id`, `amount`, `payment_type`, `direction`, `updated_at` |
| 17 | `stock_history` | Inventory audit trail | `id`, `product_id`, `change_qty`, `type`, `balance_after`, `updated_at` |
| 18 | `bundles` | Bundle/combo offers | `id`, `name`, `price`, `active` |
| 19 | `bundle_items` | Items in bundle | `id`, `bundle_id`, `product_id`, `quantity` |
| 20 | `bundle_slots` | Bundle slots | `id`, `bundle_id`, `label` |
| 21 | `bundle_slot_options` | Slot product options | `id`, `slot_id`, `product_id` |

### Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `sales` | `idx_sales_timestamp` | Date-range queries |
| `sales` | `idx_sales_customer_id` | Customer history |
| `sales` | `idx_sales_invoice_number` | Invoice lookup |
| `sales` | `idx_sales_created_at_status` | Reports |
| `products` | `idx_products_name` | Search by name |
| `products` | `idx_products_barcode` | Barcode scan |
| `product_batches` | `idx_product_batches_product_id` | Batch lookup |
| `product_batches` | `idx_product_batches_expiry` | Expiry tracking |

### Functions (12)

| Function | Purpose |
|----------|---------|
| `process_sale(sale_data JSONB)` | Atomic sale + inventory deduction |
| `process_return(sale_id UUID)` | Atomic return + inventory restoration |
| `audit_stock_integrity()` | Check stock vs batch sum mismatch |
| `audit_missing_purchase_cost()` | Find products with 0 cost |
| `generate_invoice_number()` | Auto-generate next invoice number |
| `auto_generate_invoice_number()` | Trigger-based auto invoice |
| `update_customer_stats()` | Update customer total_purchases |
| `handle_new_user()` | Auto-create public.users row on signup |
| `get_my_workspace_id()` | Returns `auth.uid()` (single-tenant) |
| `get_email_by_username(p_username)` | Login helper |
| `resolve_login_email(p_identifier)` | Login resolver |
| `generate_po_number()` | Auto-generate PO number |

### Realtime Publication (21 tables)

```sql
ALTER PUBLICATION supabase_realtime SET TABLE
  app_settings, bundles, bundle_items, bundle_slots, bundle_slot_options,
  categories, customers, discounts, expenses, payments,
  product_batches, products, purchase_order_items, purchase_orders,
  purchase_records, sales, sales_tabs, stock_history,
  supplier_transactions, suppliers, users;
```

### Seed Data

```sql
INSERT INTO app_settings (id) VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
```

### Grants

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```

---

## 🧩 Services & API Layer

Located in `src/lib/services.ts`. Har entity ka ek service object hai.

### Settings Mapping

**mapSettings(item)** — Supabase snake_case → TypeScript camelCase

```typescript
// Example mapping:
s.enable_kot_printer ?? s.enableKotPrinter ?? false
```

**toRemoteSettings(s)** — TypeScript camelCase → Supabase snake_case

```typescript
// Example mapping:
if ('enableKotPrinter' in s) { remote.enable_kot_printer = s.enableKotPrinter; }
```

### TABLE_COLUMNS (constants.ts)

Sync engine ko batata hai ke har table mein kaunse columns sync karne hain. Har naye column ko yahan add karna zaroori hai — warna sync engine transmit nahi karega.

```typescript
export const TABLE_COLUMNS: Record<string, string[]> = {
  app_settings: ['id','store_name','enable_kot_printer','created_at','updated_at', ...],
  products: ['id','name','price','stock','variant_data','modifiers', ...],
  sales: ['id','items','total','split_payments','extra_charges', ...],
  // ... all tables
}
```

### Service Objects

| Service | Key Methods |
|---------|-------------|
| `salesService` | `fetchRemote()`, `create()`, `update()`, `delete()` |
| `productsService` | `fetchRemote()`, `create()`, `update()`, `delete()` |
| `customersService` | `fetchRemote()`, `create()`, `update()` |
| `settingsService` | `fetchRemote()`, `upsert()` |
| `categoriesService` | `fetchRemote()`, `create()`, `update()` |
| `suppliersService` | `fetchRemote()`, `create()`, `update()` |
| `bundlesService` | `fetchRemote()`, `create()`, `update()`, `delete()` |
| `discountsService` | `fetchRemote()`, `create()`, `update()` |
| `batchesService` | `fetchRemote()`, `create()`, `update()`, `bulkUpsert()` |
| `expensesService` | `fetchRemote()`, `create()`, `update()` |
| `stockHistoryService` | `fetchRemote()`, `create()` |
| `purchaseOrdersService` | `fetchRemote()`, `create()`, `update()` |
| `paymentsService` | `fetchRemote()`, `create()` |

---

## 🔄 Sync Engine

Located in `src/lib/syncEngine.ts`.

### How Sync Works

1. App load hota hai → local IndexedDB se data load karta hai
2. Background mein `syncEngine` remote se fetch karta hai
3. Har record ka `updatedAt` compare hota hai — jo bhi zyada recent hai, woh retain hota hai
4. Sync complete hone ke baad `dispatch({ type: 'SET_SYNC_STATE', synced: true })`
5. Har naye change par `syncEngine.push()` call hota hai jo local → remote sync karta hai

### Key Sync Rules

- **Local-First Handshake**: Remote fetch tab hota hai jab cloud `updatedAt` 5+ minutes newer ho
- **Strict Snake-Case Mapping**: `mapSettings` always prioritizes Supabase snake_case. Never use spread operator
- **Instant Persistence**: Settings immediately sync via `handleInstantUpdate`
- **TABLE_COLUMNS**: Sync engine sirf unhi columns ko transmit karta hai jo `TABLE_COLUMNS` mein hain

### Connectivity Detection (`useSync.ts`)

```typescript
// No HEAD ping (was removed due to 401 spam)
// Uses:
// 1. navigator.onLine
// 2. online / offline window events
// 3. visibilitychange (re-checks when app comes to foreground)
// 4. Stale-data badge: SyncStatusBadge shows amber when lastSyncTime > 5min
```

---

## 🔐 Auth Flow

### How Login Works

1. User email/password se sign up/sign in karta hai
2. Supabase Auth JWT token create karta hai
3. On signup, `handle_new_user()` trigger automatically `public.users` row create karta hai
4. `public.users.role` = 'admin' manually set karna hota hai
5. App auth state ko localStorage mein cache karta hai (offline support)
6. Refresh pe: app cached profile dikhata hai jab tak auth session restore na ho

### Auth State Machine

```
No Session → [Sign In] → Session Active → [Refresh] → Session Lost → Cached Profile
                        ↑                                            |
                        └──── [Session Restored] ←────────────────────┘
```

### Important Auth Rules

- **Cached Profile**: Agar session lost ho jaye, to app cached profile use karta hai (offline mein kaam chalta rahe)
- **Session Recovery**: `onAuthStateChange` listener session restore karta hai
- **No RLS**: `anon` role ko `GRANT ALL` hai — auth token optional hai DB operations ke liye

---

## ⚙️ Settings Sync

### Architecture

```
Settings.tsx (UI Toggle)
    │
    ├── handleInstantUpdate(key, value)
    │       │
    │       ├── localDb.settings.put({ ...state.settings, [key]: value, updatedAt: now })
    │       └── syncEngine.push('app_settings', updatedSettings)
    │
    ├── mapSettings() (services.ts) — remote → local mapping
    └── toRemoteSettings() (services.ts) — local → remote mapping
```

### All Settings Keys

| Key | Type | Default | Section |
|-----|------|---------|---------|
| `storeName` | string | '' | Core |
| `storeAddress` | string | '' | Core |
| `storePhone` | string | '' | Core |
| `storeEmail` | string | '' | Core |
| `storeLogo` | string | '' | Core |
| `storeWebsite` | string | '' | Core |
| `taxRate` | number | 0 | Finance |
| `currency` | string | 'PKR' | Finance |
| `theme` | string | 'dark' | UI |
| `interfaceMode` | string | 'touch' | UI |
| `receiptPaperSize` | string | '80mm' | Receipt |
| `receiptTemplate` | string | 'modern' | Receipt |
| `receiptFontWeight` | string | '400' | Receipt |
| `receiptDensity` | number | 1.0 | Receipt |
| `enableSplitPayment` | boolean | false | Payment |
| `enableExtraCharges` | boolean | false | Payment |
| `allowCreditOverLimit` | boolean | true | Payment |
| `enableKotPrinter` | boolean | false | Kitchen |
| `autoSaveReceiptPng` | boolean | false | Auto-save receipt PNG |
| `posGridColumns` | number | 4 | POS |
| `soundEnabled` | boolean | true | System |
| `offlineMode` | boolean | true | Sync |
| `autoSync` | boolean | true | Sync |
| `touchKeyboardEnabled` | boolean | false | POS |
| ... aur bhi 50+ settings | | | |

### Singleton ID

```typescript
const SETTINGS_ID = '00000000-0000-4000-8000-000000000001';
```

---

## 🧱 Component Architecture

### POS Flow

```
POSTerminal.tsx
  ├── Searches/selects products
  ├── Adds to cart (Cart.tsx)
  ├── Applies discounts
  └── Opens CheckoutPage.tsx
        ├── Shows payment options
        ├── Processes payment
        └── Shows ReceiptPrint.tsx
              └── If enableKotPrinter → KOTPrint.tsx (500ms delay)
```

### Settings Flow

```
Settings.tsx
  ├── General Settings
  ├── Receipt & Printer (includes KOT toggle)
  ├── Barcode Settings
  ├── Inventory
  └── Users
```

### Global State (Context)

```
SupabaseAppContext.tsx
  ├── state.settings (AppSettings)
  ├── state.products (Product[])
  ├── state.sales (Sale[])
  ├── state.customers (Customer[])
  ├── state.categories (Category[])
  ├── state.suppliers (Supplier[])
  ├── state.bundles (Bundle[])
  ├── state.discounts (Discount[])
  ├── state.expenses (Expense[])
  ├── state.syncState (SyncState)
  └── state.language (string)
```

---

## 🔵 Fresh Project Setup

> Naya Supabase project + naya code clone — complete setup.

### Step 1: Clone + Install

```bash
git clone <repo-url> my-shop-pos
cd my-shop-pos
npm install
```

### Step 2: Create Supabase Project

```bash
# Via Management API
curl -s -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-shop-prod", "organization_id": "<org-id>", "plan": "pro"}'

# OR via Supabase Dashboard (https://supabase.com/dashboard)
```

### Step 3: Get Keys

```bash
# List projects
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"

# Get keys for a project
curl -s "https://api.supabase.com/v1/projects/$SUPABASE_REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```

### Step 4: Create .env.local

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_MGMT_API_KEY=sbp_...
SUPABASE_REF=<ref>
```

### Step 5: Run Master Schema

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

Ye 1 command sab kuch create karti hai:
- ✅ 21 tables (all columns, constraints, defaults)
- ✅ All indexes
- ✅ All 13 functions (incl. `on_stock_history_insert` + `on_variant_stock_history_insert` stock triggers + `get_next_invoice_number()` RPC)
- ✅ Realtime publication (21 tables)
- ✅ GRANT ALL to anon + authenticated
- ✅ Seed data (app_settings row)

### Step 6: Build

```bash
npm run build
```

### Step 7: Deploy to Cloudflare Pages

#### 7a: Create Project + Deploy (First Time)

```bash
# 1. Build
npm run build

# 2. Deploy via Wrangler (API token .env.local se auto-pick hoga)
npx wrangler pages deploy dist --project-name atonline --branch main
```

> ⚠️ **Direct Upload via curl se 404 bug hai** — hamesha wrangler CLI use karo.

#### 7b: Setup GitHub Auto-Deploy

Workflow file `.github/workflows/deploy-cloudflare.yml` already repo mein hai. Bas GitHub secrets set karo:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | `cfut_...` token |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID (API se nikal lo) |

**Via Dashboard (Manual):**
1. GitHub → Repo → Settings → Secrets and variables → Actions
2. "New repository secret" → Name + Value dalo (donon ke liye)

**Via API (Agent automatic):**
```bash
# Pehle public key lo
KEY_INFO=$(curl -s -H "Authorization: Bearer $GITHUB_PAT" \
  "https://api.github.com/repos/$GITHUB_REPO_URL/actions/secrets/public-key")
KEY_ID=$(python3 -c "import json; print(json.loads('$KEY_INFO')['key_id'])")
PUB_KEY=$(python3 -c "import json; print(json.loads('$KEY_INFO')['key'])")

# Phir encrypt karo aur set karo (Python libsodium required)
python3 -c "
import json, base64, urllib.request, ssl, os
from nacl import bindings as nacl

key_id = os.environ['KEY_ID']
pub_key = base64.b64decode(os.environ['PUB_KEY'])
token = os.environ['GITHUB_PAT']
repo = os.environ['GITHUB_REPO_URL'].replace('https://github.com/', '')

secrets = {
    'CLOUDFLARE_API_TOKEN': os.environ['CLOUDFLARE_API_TOKEN'],
    'CLOUDFLARE_ACCOUNT_ID': os.environ['CLOUDFLARE_ACCOUNT_ID']
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for name, value in secrets.items():
    encrypted = nacl.crypto_box_seal(value.encode(), pub_key)
    encrypted_b64 = base64.b64encode(encrypted).decode()
    data = json.dumps({'encrypted_value': encrypted_b64, 'key_id': key_id}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{repo}/actions/secrets/{name}',
        data=data, method='PUT',
        headers={'Authorization': f'Bearer {token}',
                 'Content-Type': 'application/json',
                 'Accept': 'application/vnd.github.v3+json'}
    )
    resp = urllib.request.urlopen(req, context=ctx)
    print(f'\u2705 {name} set')
"
```

#### 7c: Auto-Deploy Workflow

Har `git push main` pe yeh automatic hoga:
1. GitHub Action trigger
2. `npm ci` + `npm run build`
3. `wrangler pages deploy` → Cloudflare Pages live

### Step 8: Create Admin User

1. Open deployed URL
2. Sign up with email + password
3. Run SQL to set admin role:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
   ```

### Step 9: Save .env Backup

```bash
cp .env.local env_backups/my-shop.env.local
```

---

## 🟡 Existing Project Sync

> Pehle se existing DB ko latest schema se sync karna.

### Option A: Nuclear — Run Full Schema (Recommended)

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

**What it fixes:**
- Missing columns (`enable_kot_printer`, `variant_data`, `split_payments`, etc.)
- Missing indexes
- Missing/outdated functions
- Missing realtime publication tables
- Missing permissions/grants
- Missing seed data

### Option B: Run Individual Migrations

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

---

## 🟣 Post-Deployment Verification

> Setup ke baad ye 9 checks run karo to confirm sab theek hai.

### Check 1: Column Exists

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''app_settings'\'' AND column_name = '\''enable_kot_printer'\''"}'
```

**Verify these columns exist in all 3 DBs:** enable_kot_printer, enable_split_payment, enable_extra_charges, allow_credit_over_limit, pos_grid_columns, variant_data, modifiers, split_payments, extra_charges, auto_save_receipt_png

### Check 2: Realtime Publication

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tablename FROM pg_publication_tables WHERE pubname = '\''supabase_realtime'\'' ORDER BY tablename"}'
```

**Expected: 21 tables** — app_settings, bundles, bundle_items, bundle_slots, bundle_slot_options, categories, customers, discounts, expenses, payments, product_batches, products, purchase_order_items, purchase_orders, purchase_records, sales, sales_tabs, stock_history, supplier_transactions, suppliers, users

### Check 3: Functions

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT proname FROM pg_proc WHERE pronamespace = '\''public'\''::regnamespace ORDER BY proname"}'
```

**Expected (12):** audit_missing_purchase_cost, audit_stock_integrity, auto_generate_invoice_number, generate_invoice_number, generate_po_number, get_email_by_username, get_my_workspace_id, handle_new_user, process_return, process_sale, resolve_login_email, update_customer_stats

### Check 4: Grants

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT grantee, table_name, privilege_type FROM information_schema.table_privileges WHERE table_schema = '\''public'\'' AND grantee = '\''anon'\'' ORDER BY table_name"}'
```

**Expected:** Har table ke liye INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER

### Check 5: Seed Data

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT id FROM app_settings"}'
```

**Expected:** Exactly 1 row — `00000000-0000-4000-8000-000000000001`

### Check 6: Build

```bash
npm run build
# Should complete with 0 errors
```

### Check 7: Dashboard Load

- Open deployed URL
- Sign in with admin credentials
- Check: POS loads, Settings page opens, Products page loads
- Browser console mein 0 errors honi chahiye

### Check 8: Realtime Sync

- 2 browser tabs kholo side-by-side
- Ek tab mein sale karo
- Dusre tab mein 2-3 seconds mein update aana chahiye
- WiFi band karo, sale karo, dobara connect karo — auto-sync hona chahiye

### Check 9: KOT Print

- Settings → Receipt & Printer → Enable KOT
- POS mein sale karo
- Receipt print ke baad 500ms mein KOT print dialog khulna chahiye
- KOT mein display: items, qty, variants, modifiers, invoice number, sale type, cashier

---

## 📁 Migration Workflow

> Jab bhi DB mein koi change karo, ye steps follow karo:

### Step-by-Step

1. **Migration file banayein**: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. **Master schema update karein**:
   - `SUPER_MASTER_SCHEMA.sql` mein `CREATE TABLE` block update karein
   - Agar naya column hai to `ALTER TABLE ADD COLUMN IF NOT EXISTS` section bhi update karein
3. **localDb.ts update karein** (agar new table/column local storage mein bhi chahiye)
4. **types/index.ts update karein** (agar new type/field hai)
5. **services.ts update karein**:
   - `mapSettings()` mein mapping add karein (agar settings column hai)
   - `toRemoteSettings()` mein mapping add karein
6. **constants.ts update karein**: `TABLE_COLUMNS` mein column add karein
7. **settings/Settings.tsx update karein**: `formData` init mein default value add karein
8. **Migration run karein**: Management API ke through
9. **setup.md update karein**: Verification checklist + schema tables update karein
10. **Build aur verify karein**: `npm run build`

### Important Rules

- ❌ Kabhi bhi Prisma ya `DATABASE_URL` use na karein
- ❌ Kabhi bhi `workspace_id` use na karein (1 Clone = 1 Shop)
- ✅ Sirf Management API (`sbp_` token) use karein
- ✅ `ALTER TABLE ADD COLUMN IF NOT EXISTS` use karein (idempotent)
- ✅ Har change ke baad `setup.md` update karna MANDATORY hai
- ✅ Har change ke baad `SUPER_MASTER_SCHEMA.sql` update karna MANDATORY hai

### 🆕 NEW CLONE / NEW SETUP — AUTO-INSTALL ALL GUARDS (MANDATORY)

> Naya clone/shop bana rahe ho to FULL `SUPER_MASTER_SCHEMA.sql` push karo (idempotent hai — tables, functions, triggers, RLS, tombstones, guards sab auto-install ho jate hain). Individual migrations loop chhod kar master schema push karna hi standard hai:

1. `env_backups/` se us shop ka `VITE_SUPABASE_URL` (ref) + `SUPABASE_MGMT_API_KEY` lo (kabhi doosre shop ka token na use karo)
2. Full master schema via Management API push karo (Section "Database Push" command se)
3. Is push se AUTO install hota hai: saare tables + post-launch ALTERs + **row_tombstones + guard_stale_write + record_row_tombstone triggers (F21)** + variant restock columns (F22) + sab updated_at/stock triggers + RLS policies + realtime publication
4. Verification chalao — Section "Post-Deployment Verification" + F21/F22 trigger check:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT t.tablename, t.trigger_name, t.event_manipulation FROM information_schema.triggers t WHERE t.trigger_name LIKE '\''%stale_write%'\'' OR t.trigger_name LIKE '\''%tombstone%'\'' ORDER BY 1,2"}'
```

**Expected:** 16 triggers (8× guard_stale_write + 8× record_tombstone) on sales, stock_history, variant_stock_history, purchase_records, expenses, payments, store_orders, sales_tabs.
Aur variant columns check: `SELECT column_name FROM information_schema.columns WHERE table_name='purchase_records' AND column_name IN ('variant_id','variant_label');` → 2 rows.

> ⚠️ **AGENTS ke liye:** jab bhi schema change karo, is setup.md ke saare sections (Migration Log + F-rule summary + verification) SAME change mein update karo — stale setup.md = violation. Ye rule AGENTS.md + GEMINI.md ($5) mein bhi hai.

### Financial Integrity Rules (F12-F22 — 2026-08-12 audits)

Full rule text AGENTS.md + GEMINI.md mein hai. Summary:

- **F12 Single-Reversal:** Stock reversal sirf owning service mein exactly 1 baar (`salesService.delete` / `returnSale` / `purchaseRecordsService.delete`). UI handlers dobara reverse karna BANNED hai.
- **F13 Draft Rule:** Drafts = `status:'pending'` — stock/customer/revenue kabhi touch nahi karte.
- **F14 Never Truncate:** Financial queries par `.limit()`/`.slice(0,N)` BANNED — `fetchAllPages()` use karo; `state.sales` full rakho.
- **F15 Partial-Refund Dedupe:** `reportSales` + `reportRefunds` merge by sale id (duplicate `partially_refunded` ko 2x mat count karo).
- **F16 Wallet Collections:** Refund payouts `direction:'out'` — collections/totals se exclude.
- **F17 Queue Merge:** Queued `delete` = delete wins (resurrect banned); merge par `retries` reset.
- **F18 Realtime Guards:** Pending local change par remote UPDATE skip; `stock_history` realtime rows mapped.
- **F19 No Cache Wipe on Fetch Failure:** `.catch(() => [])` leading merge = local wipe; identity no-op karo.
- **F20 No Silent Ops Drops:** Type/constraint errors → op `error` (review ke liye); sync timeout `_isSyncing` release nahi karta.
- **F21 Stale-Write Guard (DB-enforced):** Deleted financial rows kabhi resurrect nahi ho sakte — `row_tombstones` + `guard_stale_write()` trigger (`STALE_WRITE`/P0007) on `sales`, `stock_history`, `variant_stock_history`, `purchase_records`, `expenses`, `payments`, `store_orders`, `sales_tabs`. Newest-wins (updated_at compare). SyncEngine P0007 op drop karta hai + cloud se refresh. Products/customers/suppliers guard NAHI hain (variation id reuse).
- **F22 Variant-Restock Ledger:** Variant stock sirf `variant_stock_history` se badalta hai (trigger → `products.variant_data[].stock`). Stock-in variant target kar sakta hai (`purchase_records.variant_id`/`variant_label`); create = 1 `purchase` entry, delete = 1 `adjustment` reversal. SAB stock-in `commitStockInToInventory` shared helper se (parallel paths BANNED); `applyVariantStockMovement()` shared service helper.

### Migration Log (recent — full changelog GEMINI.md SCHEMA CHANGE LOG mein)

| Date | Migration | Purpose |
|------|-----------|---------|
| 2026-08-12 | `20260812180000_stale_write_guards_variant_restock.sql` | F21 stale-write guards (`row_tombstones` + `guard_stale_write` P0007 on 8 financial tables) + F22 variant restock cols (`purchase_records.variant_id`/`variant_label`) |
| 2026-08-12 | `20260812142314_get_next_invoice_number_rpc.sql` | Invoice collision RPC `get_next_invoice_number()` |
| 2026-08-12 | `20260812215000_estore_cancel_double_release_guard.sql` | Estore cancel trigger sirf tab stock release karta hai jab `fulfilled_sale_id IS NULL` (double-release fix) |
| 2026-08-12 | (earlier same day) `20260812210000_inventory_sync_trigger.sql`, `20260812213000_estore_oversell_fix.sql`, `20260812213500_estore_release_stock_trigger.sql`, `20260812214000_enable_rls_stock_history.sql` | Stock trigger model + estore oversell RPC |

---

## 🔧 Troubleshooting

### 1. Pages Blink on Refresh

**Causes:**
- Static files 404 (relative paths in index.html)
- Multiple render cycles (blank → local → sync → remote merge)
- Auth session not ready at first render

**Fixes:**
- ✅ All asset paths now absolute (`/site.webmanifest`)
- ✅ Background color set inline in `<head>` (before CSS loads)
- If persists: check auth session recovery in `SupabaseAppContext.tsx`

### 2. KOT "Enable" But Nothing Happens

**Causes (3 bugs):**
1. `CheckoutPage.tsx` mein `KOTPrint` import nahi tha
2. `services.ts` mein `mapSettings()` + `toRemoteSettings()` missing
3. `constants.ts` mein `TABLE_COLUMNS` missing

**Fix:** All 3 fixed. Enable KOT in Settings → sale karo → print aayega.

### 3. enable_kot_printer Checkbox = Solid Black Square

**Cause:** Column DB mein missing + `formData` init missing

**Fix:**
- Column: migration `20260710220000_add_enable_kot_printer.sql` run karo
- Code: `formData.enableKotPrinter = state.settings?.enableKotPrinter ?? false`

### 4. Sales Query Timeout

**Cause:** `fetchRemote()` without `.order().limit()`

**Fix:** `sales.fetchRemote()` now uses `.order('created_at', { ascending: false }).limit(10000)`

### 5. 401 from HEAD Ping

**Cause:** `useSync.ts` HEAD `/rest/v1/` returns 401

**Fix:** Removed HEAD ping. Uses `navigator.onLine` + events + visibilitychange.

### 6. `loadData` / `Smart deleting` / Sync Issues

**Cause:** App local data load kar raha hai aur stale records clean kar raha hai. Normal behavior.

**Fix:** Pehla load hota hai to "smart deleting" + "sync complete" messages normal hain.

### 7. Auth Session Lost After Refresh

**Cause:** JWT token expired ya localStorage cleared

**Fix:** App cached profile use karta hai. Session restore hota hai async. Agar persist kare to:
- Check `localStorage` for `supabase.auth.token`
- Clear IndexedDB + localStorage, re-login

---

## 💻 Development Workflow

### Local Development

```bash
npm run dev
# Opens at http://localhost:5173
```

### Build for Production

```bash
npm run build
# Output in dist/
```

### Run Full Schema on Production DB

```bash
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

### Run Single Migration

```bash
SQL=$(cat supabase/migrations/20260710220000_add_enable_kot_printer.sql)
SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SQL_JSON"
```

### Push Code to All Repos

```bash
git push origin main        # jeanzone (zposdb1-crypto)
git push atonline main      # SUPABASEMAIL1/ATonline
git push minimahalpos main  # infominimahal-bit/mini-mahal-pos
git push pizzamilano main   # dispacher-zaynahspos/Pizza-Milano
```

> ⚠️ Har push ke baad GitHub Actions runs check karo: workflow naam sahi dikhna chahiye (sirf file path nahi) aur jobs > 0 honi chahiye.

### Check a Column in Production DB

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''app_settings'\'' AND column_name = '\''enable_kot_printer'\''"}'
```

---

## 🚀 Deploy Guide (Cloudflare Pages + Vercel)

> Har shop ka apna deploy setup hai. Ye guide agent ke liye hai — naya project/feature deploy karte waqt ya deploy issue debug karte waqt yahi follow karo.

### 0. ⚡ MANDATORY FLOW — Har Deploy Task ke Liye (Pehle Ye Padho!)

**Agent ka pehla action ALWAYS yeh hota hai:**

1. **`env_backups/` folder kholo** — kabhi bhi credentials dimag se/guess kar ke mat use karo. Har shop ka token wahi se lo. (GEMINI.md F-rule: credentials ka source of truth = `env_backups/`.)
2. **Deploy Map (neeche section 1) + env file dekho** — konsa project kahan deploy hota hai, uska remote kya hai, yeh table + file se confirm karo.
3. **User ne kya kaha — "all" ya specific shop?**
   - **"all" / "sab" / "4 repos"** → neeche **Section 1a: PUSH COMMANDS (ALL)** use karo — sab 4 repos ko push + har ek ka deploy verify.
   - **"jeanzone" / "atonline" / "minimahal" / "pizza" / "pizza milano" etc. (kisi ek ka naam)** → sirf usi repo ko push karo (`git push <remote> main`), baki ko mat chhedo.
   - **Ambiguous ho** ("deploy karo" bina naam ke) → pehle poocho: all ya specific?
4. **Har push ke baad verify karo** — GH Actions run `completed/success` + CF/Vercel deployment `success`/`READY` (Section 2e/3d commands). Kabhi bhi bina verify kiye "done" mat bolo.

> 🚨 **Rule:** `git push` kisi bhi remote par = wahan deploy trigger. Isliye jis ka kaha jaye usi ko push karo. Bina kahe sab ko push karne se un wanted deploys honge.

### 1. Current Deploy Map (4 Shops) + env_backups Files

| Shop | Remote | Repo | Deploy Platform | Domain | Status | env_backups File |
|------|--------|------|-----------------|--------|--------|------------------|
| jeanzone | `origin` | `zposdb1-crypto/jeanzone` | **CF Pages + Vercel** (GH Actions → CF + hook → Vercel) | jeanzone.zaynahspos.com, jeanzone.pages.dev, jeanzone.vercel.app | ✅ Auto | `JEANZONE-ENV` (sabse complete), `jeanzone.env.local` |
| atonline | `atonline` | `SUPABASEMAIL1/ATonline` | **CF Pages** (GH Actions) | atonline.zaynahspos.com, atonline.pages.dev | ✅ Auto | `ATOLINE-ENV` |
| minimahal | `minimahalpos` | `infominimahal-bit/mini-mahal-pos` | **Vercel** (GH Actions → hook, + git integration) | mini-mahal-pos.vercel.app | ✅ Auto | `minimahal-pos.env.local` |
| pizza | `pizzamilano` | `dispacher-zaynahspos/Pizza-Milano` | **Vercel** (git integration) | pizza-milano.vercel.app | ✅ Auto | `.env.local.pizza-milano.20260708_202548` |

**Credentials source of truth = `env_backups/` folder.** Har file mein konsa token hai:

| env_backups File | Kiska | Keys Present |
|------------------|-------|--------------|
| `1_jeanzone_old.env.local` / `1_jeanzone.env.local` | jeanzone (Zposdb1@gmail.com) | Supabase (URL/anon/service/mgmt), GitHub PAT ×2 (zposdb1-crypto + zaynahspos-hash), CF token + account `f61ce1b3c9f0a819714df802366c7248`, Vercel token + project + deploy hook |
| `2_atonline.env.local` | atonline (Supabasemail1@proton.me) | Supabase, GitHub PAT, CF token + account `43039ad79a149f127dc1c61725163ca6` (Vercel nahi hai) |
| `3_minimahal.env.local` | minimahal (infominimahal-1434) | Supabase, GitHub PAT, Vercel token + team + project + deploy hook |
| `4_pizzamilano.env.local` | pizza (zaynahspk-7603) | Supabase, GitHub PAT, Vercel token |

> ⚠️ **Kabhi bhi** galat shop ka token use karke deploy mat karo (jeanzone token se atonline deploy karna = forbidden). Har file apni shop ka hai.

### 1a. PUSH COMMANDS — ALL (sab 4 repos + deploy verify)

```bash
# Sab 4 repos ko push (order: origin, atonline, minimahalpos, pizzamilano)
git push origin main
git push atonline main
git push minimahalpos main
git push pizzamilano main

# PHIR sab ke GH Actions verify (Section 2e commands — har repo ka)
# PHIR CF/Vercel deploy verify (Section 2e/3d — har shop ka)
```

### 1b. PUSH COMMANDS — EK SHOP (specific)

```bash
# jeanzone
git push origin main

# atonline
git push atonline main

# minimahal
git push minimahalpos main

# pizza
git push pizzamilano main
```

**Deploy map note:** jeanzone push karne par CF + Vercel dono auto hote hain (GH Actions hook se). atonline par sirf CF. minimahal par sirf Vercel (hook + git integration dono). pizza par sirf Vercel (git integration).

### 2. Cloudflare Pages Setup (Naya Project ke liye)

#### 2a. Token + Account ID

```bash
# Token verify
curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Account ID
curl -s "https://api.cloudflare.com/client/v4/accounts" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

- Token permissions chahiye: `Account > Cloudflare Pages > Edit` + `Account Settings > Edit`
- ⚠️ **Har shop ka apna CF account hai!** jeanzone = `Zposdb1@gmail.com's Account` (`f61ce1b3c9f0a819714df802366c7248`), atonline = `Supabasemail1@proton.me's Account` (`43039ad79a149f127dc1c61725163ca6`). Galat account par project banao to `jeanzone-18k.pages.dev` jaisa suffixed subdomain milta hai — matlab galat account par ho!

#### 2b. Project List / Create

```bash
# List projects
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Create project
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<shop-name>","production_branch":"main"}'
```

#### 2c. GitHub Actions Workflow (Deploy Trigger)

Har repo mein `.github/workflows/deploy-cloudflare.yml` hai — ye hi CF deploy karta hai:

```yaml
name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.VITE_SUPABASE_SERVICE_ROLE_KEY }}
      - name: Set Cloudflare project name
        id: cfname
        run: echo "name=$(echo '${{ github.event.repository.name }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name ${{ steps.cfname.outputs.name }} --branch main
      - name: Trigger Vercel deploy
        env:
          VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}
        run: |
          if [ -n "$VERCEL_DEPLOY_HOOK" ]; then
            curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"
          else
            echo "no Vercel deploy hook configured - skipping"
          fi
```

**🚨 CRITICAL RULES (broken hui thi — dobara mat todna):**
1. **NEVER** `${{ github.event.repository.name | lower }}` workflow ke `command:` field mein — GitHub Actions parser toot jata hai (0 jobs, workflow naam file path ban jata hai, NO deploy). Project name hamesha shell step se compute karo (`tr '[:upper:]' '[:lower:]'`).
2. **NEVER** `if: secrets.X != ''` — secrets step `if:` mein use nahi hote. Hamesha `env:` mapping + shell check.
3. `.github/workflows/*` change ke baad: **sab 4 repos push karo** + run verify karo (real workflow naam + jobs > 0) pehle hi.

#### 2d. GitHub Secrets (Repo ke liye)

```bash
# Public key lo
PUBKEY=$(curl -s "https://api.github.com/repos/$OWNER/$REPO/actions/secrets/public-key" \
  -H "Authorization: Bearer $GITHUB_PAT" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['key_id']+' '+d['key'])")
KEYID=$(echo $PUBKEY | cut -d' ' -f1); KEY=$(echo $PUBKEY | cut -d' ' -f2)

# Secret set karo (PyNaCl encrypted)
pip3 install pynacl
ENC=$(python3 -c "
import base64
from nacl import encoding, public
pub = public.PublicKey('$KEY', encoding.Base64Encoder())
sealed = public.SealedBox(pub).encrypt('$VALUE'.encode())
print(base64.b64encode(sealed).decode())")
curl -X PUT "https://api.github.com/repos/$OWNER/$REPO/actions/secrets/$NAME" \
  -H "Authorization: Bearer $GITHUB_PAT" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "{\"encrypted_value\":\"$ENC\",\"key_id\":\"$KEYID\"}"
```

Required secrets (har CF repo): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, optional: `VERCEL_DEPLOY_HOOK`.

#### 2e. Deploy Verify (Workflow + CF)

```bash
# Workflow runs
curl -s "https://api.github.com/repos/$OWNER/$REPO/actions/runs?per_page=3" -H "Authorization: Bearer $GITHUB_PAT"

# CF deployments
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/deployments?per_page=1" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### 3. Vercel Setup (Naya Project ke liye)

#### 3a. Token + Project

```bash
# Token verify
curl -s "https://api.vercel.com/v2/user" -H "Authorization: Bearer $VERCEL_TOKEN"

# Projects list (name + git link dekhne ke liye)
curl -s "https://api.vercel.com/v9/projects?limit=100" -H "Authorization: Bearer $VERCEL_TOKEN"
```

#### 3b. Vercel Deploy Hook (GH Actions se trigger hone ke liye)

```bash
# Deploy hook banao (ref = branch)
curl -s -X POST "https://api.vercel.com/v1/projects/$PROJECT_ID/deploy-hooks" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"gh-actions","ref":"main"}'
```

- Hook URL output: `https://api.vercel.com/v1/integrations/deploy/$PROJECT_ID/$HOOK_ID` — isko repo secret `VERCEL_DEPLOY_HOOK` mein daalo (upar 2d wala method).
- Hook list: `GET /v1/projects/{id}/deploy-hooks` se nahi aata — `GET /v9/projects/{id}` ke response ke `link.deployHooks[]` se milta hai.

#### 3c. Vercel Git Integration (Relink)

```bash
# Project ka link dekho
curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID" -H "Authorization: Bearer $VERCEL_TOKEN"

# Relink (agar galat repo se linked ho)
curl -s -X POST "https://api.vercel.com/v9/projects/$PROJECT_ID/link" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"github","repo":"$OWNER/$REPO"}'
```

> ⚠️ `repo_no_access` error = Vercel GitHub App us org par installed nahi. Fix: Vercel dashboard → Settings → Git → reconnect, ya Deploy Hook approach use karo (3b) jo git integration ki zaroorat nahi rakhta.

#### 3d. Vercel Deploy Verify

```bash
curl -s "https://api.vercel.com/v6/deployments?projectId=$PROJECT_ID&limit=3" -H "Authorization: Bearer $VERCEL_TOKEN"
# readyState: READY = success | BLOCKED = commit author bot hai (COMMIT_AUTHOR_REQUIRED)
```

> ⚠️ **BLOCKED fix:** Vercel hobby plan bot-authored commits block karta hai. Fix: `git commit --amend --author="name <email>"` kar ke real author lagao + force-push.

### 4. Deploy Issue Checklist (Jab deploy nahi hota)

1. **GH Actions run dekho** — workflow naam path hai? jobs 0? → workflow YAML broken (rule 2c check)
2. **Secrets set hain?** — `GET /repos/{owner}/{repo}/actions/secrets`
3. **CF project sahi account par hai?** — pages.dev subdomain mein suffix (`jeanzone-18k`) = galat account
4. **CF project source kya hai?** — `source: null` = git integration nahi, sirf GH Actions/wrangler se deploy hoga
5. **Vercel BLOCKED?** — commit author fix karo (3d)
6. **Vercel repo_no_access?** — Deploy Hook use karo (3b)
7. **Purana repo transfer?** — CF/Vercel git integration toot jata hai jab repo owner change hota hai → relink (2c/3c)

### 5. Workflow Examples (Agent ke liye ready-made responses)

**Scenario A: "all pe push karo" / "all deploy karo" / "sab jagah push"**
```
1. env_backups/ dekh (sab shop files)
2. git push origin main + atonline + minimahalpos + pizzamilano
3. Har repo ke GH Actions run verify: curl runs?per_page=1 → completed/success (4 repos)
4. CF verify: jeanzone + atonline deployments?per_page=1 → success
5. Vercel verify: jeanzone + minimahal + pizza deployments → READY
```

**Scenario B: "jeanzone deploy karo" (ya koi ek shop)**
```
1. env_backups/JEANZONE-ENV dekh (sirf jeanzone wali file)
2. git push origin main   (sirf yeh remote — baki 3 ko nahi)
3. jeanzone ke GH Actions verify → completed/success
4. CF jeanzone deploy verify + Vercel jeanzone READY
```

**Scenario C: "vercel pe deploy karo" (platform bola, shop nahi)**
```
1. Deploy map se shop identify karo jiske paas Vercel hai: jeanzone, minimahal, pizza
2. Poocho: sab 3 ya koi ek? (agar "sab" to Scenario A; ek ho to Scenario B wala pattern)
```

**Scenario D: naye shop ka deploy setup banana**
```
1. env_backups/ mein nayi file banao (purani pattern copy karo)
2. Section 2 (CF) ya Section 3 (Vercel) follow karo — project banao, hook banao, secrets set karo
3. Deploy Map + env_backups table mein naya shop add karo (yeh guide update karo!)
4. GH Actions workflow repo mein hai to wo hi chalega; nahi to 2c se add karo
```

---

## 🔑 Quick Reference: Management API

```bash
# Run SQL
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

---

## 📌 Agent Rules (GEMINI.md + AGENTS.md)

### ✅ setup.md Must Stay Updated

Har agent ke liye mandatory rules:

1. **Schema change kiya?** → `docs/setup.md` update karo (new column in table, verification checklist update)
2. **Migration banayi?** → `docs/setup.md` mein migration workflow section check karo
3. **Naya feature add kiya?** → `docs/setup.md` mein relevant section update karo
4. **Kuch bhi DB/code change kiya?** → `docs/setup.md` + `SUPER_MASTER_SCHEMA.sql` dono sync mein rakhna

> **Failure to keep setup.md updated = Violation of Prime Directive.**

### 🛑 2026-08-12 Architecture & Policy Updates
- **Shift System Removed (Rule F7)**: The shift management logic and columns have been completely and permanently removed. The POS runs completely independent of shifts.
- **Estore Oversell Fix**: Estore online orders NO LONGER reserve or deduct stock when placed. Stock is ONLY deducted when the order is fulfilled and billed via the POS terminal checkout.
- **24-Hour Online Order Auto-Delete**: Cancelled online orders that are older than 24 hours are automatically deleted by the app's maintenance prune (syncEngine) to keep the cache and DB clean without affecting financials.

---

## 🔍 18. DEEP DIVE: DB Operations, Realtime, RLS & Tombstones

Zaynah's POS is entirely powered by a **Local-First + Supabase Cloud Architecture**. Here is a complete guide to how the database and sync mechanics actually work under the hood.

### 1. Database Operations via Management API (NO PRISMA)
Humne Prisma ORM aur direct Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`) completely **remove/ban** kar diye hain.
- **Why?** Prisma connection pools limit scalability aur offline-first PWA mein direct connections secure/stable nahi hote.
- **How we do it now:** Saari database schema changes (tables, columns, triggers) sirf aur sirf **Supabase Management API** ke zariye `curl` HTTP POST requests se hoti hain.
- **Token Used:** `sbp_XXXXXXXXXXXXXXXXXXXXXXXXX` (`SUPABASE_MGMT_API_KEY`).
- **Master Schema:** `SUPER_MASTER_SCHEMA.sql` hi wahid file hai. Jab bhi naya project banega ya update hoga, yehi file API ke zariye execute hogi. Yeh file *idempotent* hai (matlab isko baar baar chalane se error nahi aata, `IF NOT EXISTS` use hua hai).

### 2. Supabase Realtime (WebSockets)
POS multi-device support (e.g. 5 cashiers ek sath) ke liye **Supabase Realtime** use karta hai.
- **Publication:** Master schema mein `supabase_realtime` publication banti hai aur **21 tables** usme add hote hain:
  `ALTER PUBLICATION supabase_realtime ADD TABLE sales, products, customers...`
- **Client Side:** `syncEngine.ts` mein Supabase JS SDK ke zariye `.channel('public:*').on('postgres_changes', ...).subscribe()` setup kiya gaya hai.
- **Flow:** Jaise hi kisi device se koi row insert/update/delete hoti hai, cloud baqi sabhi connected devices ko milliseconds mein event push kar deta hai, jise local IndexedDB (Dexie) mein save karke React state update kar di jati hai.

### 3. Row-Level Security (RLS) & Permissions
Kyunke Zaynahs POS ek **single-tenant** system hai (1 clone = 1 shop), hum complex Auth/RLS rules par rely nahi karte.
- **Access Level:** Har table par `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;` run kiya jata hai.
- **No Restrictions:** App `VITE_SUPABASE_ANON_KEY` use karti hai. RLS policies ko intentionally *permissive* rakha gaya hai taake PWA offline/online mode mein smoothly sync kar sake.
- **Tombstones RLS:** Nayi `row_tombstones` table par bhi RLS hai lekin usme `anon` aur `authenticated` roles ko `ALL` (insert/select) ki permission allow ki gayi hai taake POS delete operations track kar sake.

### 4. Cross-Device Deletion & Stale-Write Guards (F21 & F22 Rules)
Offline-first apps ka sab se bada masla yeh hota hai ke agar Device A ne koi bill delete kiya, aur Device B offline thi. Jab Device B online aayegi toh woh delete shuda bill dubara upload kar degi (Resurrection/Ghost data).
Isay solve karne ke liye DB level par 3 specific cheezein add ki gayi hain:

1. **Row Tombstones (Nishani):** Jab bhi koi financial record (sale, expense, stock_history) delete hota hai, ek database trigger `record_row_tombstone()` chalta hai aur us ID ko `row_tombstones` table mein daal deta hai.
2. **Stale Write Guard:** Jab bhi koi device purana (stale) data UPDATE ya INSERT karne ki koshish karti hai, ek database trigger `guard_stale_write()` pehle check karta hai ke kya yeh ID tombstones mein hai? Agar hai, toh transaction ko block kar deta hai (Error `P0007`).
3. **SyncEngine Resolution:** Agar SyncEngine ko cloud se `P0007` (Stale Write) error milta hai, toh woh samajh jata hai ke uski local queue outdated hai. Woh us operation ko queue se nikal deta hai aur cloud se fresh state fetch kar leta hai.

**F22 Variant Ledger:** Variants (Sizes/Colors) ke stock restock ko properly track karne ke liye hamesha `variant_stock_history` table use hota hai. JSON arrays directly replace nahi kiye jate taake ledger maintain rahay.

---
