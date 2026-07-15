# 🚀 Zaynah's POS — Complete System Guide

> **One guide to rule them all.** Agent is guide dekh k current system completely run kar sakta hai, aur naya project bhi setup kar sakta hai.
> `sub update ho jaye` — har change ke baad ye guide update karna mandatory hai.

---

## 📑 Table of Contents

1. [System Overview](#-system-overview)
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
| 15 | `supplier_transactions` | Supplier khata | `id`, `supplier_id`, `type`, `amount`, `balance_after` |
| 16 | `payments` | Supplier payments | `id`, `supplier_id`, `amount`, `payment_type`, `direction` |
| 17 | `stock_history` | Inventory audit trail | `id`, `product_id`, `change_qty`, `type`, `balance_after` |
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
- ✅ All 12 functions
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

**Verify these columns exist in all 3 DBs:** enable_kot_printer, enable_split_payment, enable_extra_charges, allow_credit_over_limit, pos_grid_columns, variant_data, modifiers, split_payments, extra_charges

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
git push jeanzone main
git push minimahalpos main
git push pizzamilano main
```

### Check a Column in Production DB

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''app_settings'\'' AND column_name = '\''enable_kot_printer'\''"}'
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
