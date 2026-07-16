# 🏗️ Zaynahs POS — MASTER CURSOR RULES (ALL FIXES MERGED)
> Replace your entire .cursorrules file with this. Every known bug is addressed here permanently.

> ⚡ **Supabase Management API Only** — All database operations MUST use the `sbp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` token + curl/API. 
> Prisma and direct DB connections have been completely removed. See [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for complete API reference.

---

# ⛔ RULE #0 — ABSOLUTE PRIME DIRECTIVE

1. **Fulfill the Request**: Modify, refactor, or create exactly what the user asks without hesitation.
2. **Design Parity**: Maintain "Expert Density" aesthetic and established design patterns.
3. **Direct Action**: Find the relevant files and implement the fix directly.
4. **DATA INTEGRITY FIRST**: Financial and stock data is NEVER approximated. If uncertain → throw error, never silently fallback to 0.
5. **🎨 UI TASKS (MANDATORY)**: Before touching ANY UI/UX code (styling, components, layouts, responsiveness, animations), YOU MUST READ [docs/UI_RULES.md](docs/UI_RULES.md) FIRST. Failure to do so is a violation of the Prime Directive.
6. **📏 SIZING RULE (MANDATORY)**: For all new pages and components, Modals MUST use `maxWidth="lg"` or `"xl"` (never sm or md for forms) with a 2-column grid (`md:grid-cols-2`), and ALL buttons MUST include `.btn-md` by default unless specifically overriding.
7. **📱 MOBILE MODAL RULE (MANDATORY)**: All Modals, Popups, and Drawers (including Cart) MUST be displayed in the center of the screen on mobile devices (`items-center justify-center`). NEVER use bottom sheets (`items-end` or `justify-end`) for modals.
8. **STRICT DATABASE POLICY (NO PRISMA)**: Direct DB connections, Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`), and Prisma ORM are completely banned. You must strictly use the Supabase Management API via HTTP/curl for all database schema and data control. Refer to [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for the exact API specifications.
9. **📄 DOCS MUST STAY CURRENT (MANDATORY)**: Every time you change the database schema (columns, tables, indexes, functions) or add a new feature that affects setup/configuration, you MUST:
   - Update `supabase/schema/SUPER_MASTER_SCHEMA.sql` (both CREATE TABLE + ALTER TABLE ADD COLUMN IF NOT EXISTS blocks)
   - Update `docs/setup.md` (add column to post-launch table, update checklist if applicable)
   - Failure to keep both in sync is a violation.
10. **💀 SKELETON LOADING RULE (MANDATORY)**: All loading states for main layout switches, routes, or grid views (storefront, product grid, list pages) MUST use the centralized `<SkeletonLoader />` component (`src/components/common/SkeletonLoader.tsx`) to provide a premium, smooth shimmer load experience. Generic spinner loaders are strictly prohibited for primary loaders.

---

# 🔴 FINANCIAL INTEGRITY RULES (NEW — HIGHEST PRIORITY)

## RULE F1 — DUPLICATE PRODUCT PREVENTION (PERMANENT FIX)

**NEVER create a product without checking for existing name first.**

Before ANY `productsService.create()` call, you MUST check:
```typescript
const { data: existing } = await supabase
  .from('products')
  .select('id, stock')
  .ilike('name', productData.name.trim())
  .maybeSingle();

if (existing) {
  throw new Error(`Product "${productData.name}" already exists (ID: ${existing.id}). Use stock update instead of creating duplicate.`);
}
```

**DB Level constraint** — this migration MUST exist in SUPER_MASTER_SCHEMA.sql:
```sql
-- Prevent duplicate product names at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique 
ON products (LOWER(TRIM(name)));
```

If you see `ERROR: duplicate key value violates unique constraint` → this is WORKING CORRECTLY. Show user a proper error message, do not bypass.

---

## RULE F2 — STOCK HISTORY IS MANDATORY (NEVER SKIP)

Every single stock change MUST write to `stock_history`. No exceptions ever.

| Event | type value | changeQty sign |
|-------|-----------|---------------|
| Product created with stock > 0 | `initial` | positive |
| Purchase record added | `stock_in` | positive |
| Sale created | `sale` | negative |
| Sale deleted or returned | `return` | positive |
| Manual adjustment up | `adjustment` | positive |
| Manual adjustment down | `adjustment` | negative |
| Supplier return | `adjustment_out` | negative |

**If you write code that changes `products.stock` WITHOUT writing to `stock_history` → that code is WRONG. Fix it immediately.**

Correct pattern:
```typescript
// Step 1: Update product stock
await supabase.from('products').update({ stock: newStock }).eq('id', productId);

// Step 2: ALWAYS log to stock_history (never skip this)
await supabase.from('stock_history').insert({
  product_id: productId,
  change_qty: changeAmount,   // positive or negative
  balance_after: newStock,
  type: 'sale',               // use correct type from table above
  reference_id: saleId,       // link to source record
  created_at: new Date().toISOString()
});
```

---

## RULE F3 — DUAL BATCH SYNC (MOST COMMON BUG)

Stock lives in THREE places. ALL THREE must be updated in every single stock operation:

```
products.stock              ← integer (fast reads, UI display)
product_batches.qty_remaining  ← per-batch FIFO detail (source of truth for cost)
products.batches[]          ← embedded JSON array (UI cache)
```

**Rule: Never update one without updating all three.**

After any stock operation, this query MUST return zero rows:
```sql
SELECT p.name, p.stock, COALESCE(SUM(pb.qty_remaining), 0) as batch_sum
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.qty_remaining > 0
GROUP BY p.id, p.name, p.stock
HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0);
-- Zero rows = system healthy. Any rows = stock corrupt.
```

---

## RULE F4 — BILL EDIT MUST BE ATOMIC

Bill edit = delete old sale + create new sale. These are TWO operations that must behave as ONE.

**If delete succeeds but create fails → stock gets over-inflated and revenue disappears. This is a critical financial bug.**

Required pattern in `CheckoutModal.tsx` and `services.ts`:
```typescript
// CORRECT: Use a flag to detect partial failure
const editSale = async (oldSaleId: string, newSaleData: Sale) => {
  let deleteSucceeded = false;
  
  try {
    // Phase 1: Delete old sale (restores stock)
    await salesService.delete(oldSaleId);
    deleteSucceeded = true;
    
    // Phase 2: Create new sale (deducts stock)
    const newSale = await salesService.create(newSaleData);
    return newSale;
    
  } catch (error) {
    if (deleteSucceeded) {
      // Phase 1 succeeded but Phase 2 failed
      // Stock is now over-inflated — alert user immediately
      console.error('CRITICAL: Bill edit partially failed. Stock may be incorrect.', { oldSaleId });
      await sonner.alert(
        '⚠️ Bill Edit Incomplete',
        'The original sale was removed but the new one could not be saved. Please check stock levels and re-enter the sale manually.',
        'Understood'
      );
      // Log to pendingOps for manual review
      await logPendingOpError('bill_edit_partial', { oldSaleId, newSaleData });
    }
    throw error;
  }
};
```

---

## RULE F5 — PURCHASE COST MUST NEVER BE ZERO SILENTLY

When calculating COGS/profit, the priority chain is:
1. `item.purchaseCost` (FIFO-calculated at sale time) ← BEST
2. `item.product.cost × qty` (current product cost) ← FALLBACK, flag it
3. STOP — never use 0, throw a warning

```typescript
// CORRECT pattern in ReportsManager.tsx
const getCOGS = (item: SaleItem): { cost: number; estimated: boolean } => {
  if (item.purchaseCost && item.purchaseCost > 0) {
    return { cost: item.purchaseCost, estimated: false };
  }
  if (item.product?.cost && item.product.cost > 0) {
    console.warn(`[COGS] Using current product cost for item ${item.productId} — FIFO cost missing`);
    return { cost: item.product.cost * item.quantity, estimated: true };
  }
  // NEVER return 0 silently
  console.error(`[COGS] No cost available for item ${item.productId} — profit will be wrong`);
  return { cost: 0, estimated: true };
};

// In report display: if estimated=true, show ⚠️ next to profit figure
```

---

## RULE F6 — REPORTS MUST QUERY DB DIRECTLY (NOT IN-MEMORY)

**NEVER calculate reports from in-memory `state.sales` array.**

The in-memory state is capped at 1000 records for performance. Using it for reports means any store with 1000+ sales gets wrong monthly/annual totals — silently.

```typescript
// WRONG — uses memory cap
const revenue = state.sales
  .filter(s => isInRange(s.createdAt, startDate, endDate))
  .reduce((sum, s) => sum + s.total, 0);

// CORRECT — queries Supabase directly with date filter
const { data: salesData } = await supabase
  .from('sales')
  .select('total, items, shift_id, created_at, status')
  .gte('created_at', startDate.toISOString())
  .lte('created_at', endDate.toISOString())
  .neq('status', 'refunded');

const revenue = salesData?.reduce((sum, s) => sum + s.total, 0) ?? 0;
```

---

---

## RULE F7 — SINGLE TENANT ARCHITECTURE
This is a 1 Clone = 1 Shop system.  and  do NOT exist and should never be used.

## RULE F7 — SINGLE TENANT ARCHITECTURE
This is a 1 Clone = 1 Shop system. workspace_id and shift_id do NOT exist and should never be used.

## RULE F8 — STOCK AUDIT FUNCTION (ADD TO SERVICES.TS)

This function must exist in `services.ts` and be callable from admin panel:

```typescript
export const auditStockIntegrity = async (): Promise<{
  corrupt: Array<{ name: string; stock: number; batchSum: number; diff: number }>;
  clean: number;
}> => {
  const { data } = await supabase.rpc('audit_stock_integrity');
  // RPC returns products where stock != sum of batch qty_remaining
  return data;
};
```

---

# 🗄️ DATABASE MIGRATION RULES (THE GOLDEN RULE)

Whenever ANY change to database structure is made:

1. **Create Incremental Migration**: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. **Update Master Schema**: `supabase/schema/SUPER_MASTER_SCHEMA.sql`
3. **Run SQL via Management API** (NOT psql / Dashboard):
   ```bash
   SQL=$(cat supabase/migrations/20260519120000_description.sql)
   SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d "$SQL_JSON"
   ```
4. **Sync Local DB**: Update `src/lib/localDb.ts`
5. **Log & Document**: Add comment at top of migration file

> 🔍 **Get project ref from URL:** `https://{ref}.supabase.co` — or list all projects via `curl -s "https://api.supabase.com/v1/projects" -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"`

### 🚨 Troubleshooting Cheatsheet
- `AUTO-BLACKLISTED COLUMN: 'xyz'` → Column missing in Supabase. Run `ALTER TABLE`.
- `400 Bad Request` → Schema mismatch or column type error. Check Network tab.
- `403 Forbidden` → RLS policy violation. Check `pg_policies`.
- `Reset to 0` → Field missing in `initialState` or overwritten by `null`. Check `mapSettings` defaults.
- `Stock mismatch in audit` → Run `SELECT * FROM audit_stock_integrity();` and fix each product.
- `Duplicate product` → UI must catch and show error, never create second entry.

---

# 🧠 Project Knowledge Base

### Core Context & State
- **Global State**: `src/context/SupabaseAppContext.tsx`
- **Auth Logic**: `src/context/SupabaseAppContext.tsx`

### Database & Sync Logic
- **Local DB**: `src/lib/localDb.ts`
- **Sync Engine**: `src/lib/syncEngine.ts`
- **API Services**: `src/lib/services.ts` ← All CRUD operations live here
- **Master Schema**: `supabase/schema/SUPER_MASTER_SCHEMA.sql`

### UI Components
- **Global Dialog System**: `src/lib/dialog.tsx` & `src/components/common/DialogProvider.tsx`
- **Scanner**: `src/components/common/CameraScanner.tsx`
- **POS Interface**: `src/components/pos/`
- **Settings**: `src/components/settings/Settings.tsx`
- **Inventory**: `src/components/inventory/`
- **Reports**: `src/components/reports/`

### Entry Points
- **Web Entry**: `src/main.tsx`
- **Main App**: `src/App.tsx`
- **Style Tokens**: `src/index.css`

---

# 🏗️ FEATURE IMPLEMENTATION WORKFLOW (GOLDEN ORDER)

1. **DB Plan**: Design tables, columns, RLS rules
2. **Supabase SQL**: Run via Management API (`curl` + `sbp_` token) — see [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) §5
3. **Local DB**: Add to `localDb.ts`
4. **Types**: Define interfaces in `types.ts`
5. **SyncEngine**: Register new entity
6. **Services**: Write CRUD in `services.ts` following F1-F8 rules above
7. **UI Component**: Build React page using [docs/UI_RULES.md](docs/UI_RULES.md) design rules

---

# 🚀 FULL DATABASE PUSH WORKFLOW

1. Ensure `SUPABASE_MGMT_API_KEY` is set in `.env.local` (or env)
2. Execute `SUPER_MASTER_SCHEMA.sql` via Management API:
   ```bash
   SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
   SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d "$SCHEMA_JSON"
   ```
3. Execute `scratch/sync_settings.sql` same way
4. Verify dashboard loads correctly

---

# 🔑 CREDENTIALS UPDATE RULE

When user says "credentials update karo" or provides new Supabase details, update:

| File | What to Update |
|------|---------------|
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MGMT_API_KEY` |
| `.env` (root) | Same as `.env.local` |

To get keys for a new project via Management API (no Dashboard needed):
```bash
# Get API keys (anon + service_role)
curl -s "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```

After update: run `npm run build`, clear browser IndexedDB.

---

# ⚙️ SETTINGS SYNC STRATEGY

- **Local-First Handshake**: Load remote only if cloud `updatedAt` is 5+ minutes newer than local
- **Strict Snake-Case Mapping**: `mapSettings` always prioritizes Supabase snake_case. Never use spread operator
- **Instant Persistence**: Every setting syncs immediately on change via `handleInstantUpdate`
- **Singleton ID**: Always use `00000000-0000-4000-8000-000000000001`
- **Type Safety**: Font Weight always String. Sliders use correct type.

---

# 🤖 AI AGENT OPERATING RULES

1. **Think Before Acting**: Analyze, break into steps, avoid unnecessary complexity
2. **Code Quality**: Clean, readable, modular, DRY
3. **Project Awareness**: Read existing files, respect architecture, do NOT rewrite unnecessarily
4. **Minimal Scanning**: Only read files directly related to the task
5. **File Verification**: Before editing a component, verify its actual usage in `App.tsx`
6. **DATA SAFETY**: Never make changes that could corrupt financial data without explicit confirmation
7. **🎨 STRICT UI PROTOCOL (MANDATORY)** — Before writing or editing ANY UI code (React components, Tailwind, CSS), you MUST read **[docs/UI_RULES.md](docs/UI_RULES.md)** first. Never introduce new inline styles, hardcoded colors, or one-off components when an existing pattern in docs/UI_RULES.md covers the case.
8. **🖼️ CENTRALIZED MEDIA SELECTOR & COMPRESSION (MANDATORY)**: All image uploads or selection workflows (products, deals, settings, logo, etc.) MUST route strictly through the centralized `MediaLibrary` component. Direct file upload triggers are banned outside the library. This enforces automatic image compression (WebP, 20-50KB target) via `compressImage` and permits image reuse across the database.
9. **🎯 BRAND ISOLATION RULE**: Only `/store` route uses saved business name + logo from settings. All other app routes (POS, admin, reports, inventory, etc.) MUST always use hardcoded Zaynahs defaults ("Zaynahs POS" + `/zaynahs-logo.svg`). Files enforcing: `src/lib/dynamicManifest.ts`, `src/App.tsx`, `index.html`. The original gradient-Z SVG at `/zaynahs-logo.svg` is the permanent default and must never be deleted.

---

# 🚨 ERROR HANDLING PROTOCOL

When user pastes any error or screenshot:
1. Identify type from Troubleshooting Cheatsheet above
2. Read ONLY the relevant file
3. Fix + migration if DB related
4. One response, complete fix, no back and forth

---

# 📁 FILE CREATION RULE

- Check `App.tsx` routing first
- Follow existing component structure
- Auto-register in router if it's a page
- Never create dead/unused files

---

# 🔍 STOCK INTEGRITY VERIFICATION QUERIES

Run these any time stock looks wrong:

**1. Duplicate products:**
```sql
SELECT name, COUNT(*) as count FROM products GROUP BY name HAVING COUNT(*) > 1;
```

**2. Stock vs batch mismatch:**
```sql
SELECT p.name, p.stock, COALESCE(SUM(pb.qty_remaining),0) as batch_sum
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
GROUP BY p.id, p.name, p.stock
HAVING p.stock != COALESCE(SUM(pb.qty_remaining), 0);
```

**3. Sales without shift:**
```sql
SELECT COUNT(*) FROM sales WHERE shift_id IS NULL;
```

**4. Expenses without shift:**
```sql
SELECT COUNT(*) FROM expenses WHERE shift_id IS NULL;
```

**5. Sales with missing purchase cost:**
```sql
SELECT id, created_at FROM sales
WHERE items::text LIKE '%"purchaseCost":0%'
   OR items::text LIKE '%"purchaseCost":null%';
```

---

# 🔧 ZAYNAHS POS — COMPLETE FIX PROMPT

You are a senior POS system engineer with 20 years experience. 
Read the ENTIRE codebase first, then fix ALL issues below in one pass. 
Do NOT break existing functionality. Fix in exact order given.

---

## STEP 1 — READ THESE FILES FIRST (before touching anything)

Read all of these completely:
- `src/lib/services.ts`
- `src/context/SupabaseAppContext.tsx`
- `src/components/pos/CheckoutModal.tsx`
- `src/components/reports/ReportsManager.tsx`
- `src/components/shifts/ShiftClosePage.tsx`
- `src/lib/localDb.ts`
- `src/lib/syncEngine.ts`
- `supabase/schema/SUPER_MASTER_SCHEMA.sql`

... (Rest of the Fix Prompt steps should follow here, but I will truncate for brevity as it's a template) ...

---

jab tak kaha na jaye npm run build ma kro

---

# ⏱️ RETENTION & AUTO-CLEANUP RULES

### RULE R1 — AUTOMATIC 24-HOUR RETENTION FOR CANCELLED ORDERS
Every cancelled order (`status === 'cancelled'`) must be automatically pruned after 24 hours of inactivity.
This is implemented in `syncEngine.ts` inside `pruneExpiredCancelledOrders()`, which runs at app startup and every hour.
It performs a dual-cleanup:
1. **Local cache deletion**: Queries Dexie IndexedDB `sales` and deletes expired ids to keep local storage light.
2. **Cloud sync deletion**: Executes a Supabase REST API `DELETE` query targeting matching cancelled rows to keep remote storage clean.

To implement similar auto-deletion models in the future:
- Ensure the target column is indexed in IndexedDB (`localDb.ts`) for fast queries.
- Query locally via Dexie `.toArray()`, filter by timestamp, and call `bulkDelete()`.
- Query remotely via Supabase REST API `.delete().eq('status', ...).lt('updated_at', cutoff)`.
- Register the cleanup function inside `startSyncEngine()` startup and the background interval timer.

---

# 📜 SCHEMA CHANGE LOG (AUDIT TRAIL)

Whenever a database change is made, it MUST be recorded here.

> ⚠️ **STRICT RULE:** Every new column MUST be added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the post-launch ALTER TABLE block. Adding only to `CREATE TABLE` is NOT enough — existing DBs skip CREATE TABLE and never get the column. This applies to EVERY schema change, every time.

### [2026-07-15] FIX: Add missing estore columns to ALTER TABLE in SUPER_MASTER_SCHEMA
**Issue:** `estore_theme_color`, `estore_delivery_fee`, `estore_min_order`, `estore_cod_enabled` were only in `CREATE TABLE` block (lines 275-278) but NOT in any `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Existing DBs never got them.
**Fix:** Added all 4 columns to the post-launch `ALTER TABLE app_settings` block in `SUPER_MASTER_SCHEMA.sql`.
**Rule Added:** STRICT RULE in AGENTS.md + GEMINI.md — every new column MUST have `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### [2026-07-15] Add Store Type & Shop Location Columns to app_settings
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `SupabaseAppContext.tsx`, `Settings.tsx`, `StoreCheckout.tsx`, `supabase/migrations/20260715120000_add_store_type_location.sql`, `GEMINI.md`
**Changes:**
1.  **Schema Migration:** Created `supabase/migrations/20260715120000_add_store_type_location.sql` adding `store_type TEXT DEFAULT 'both'`, `store_latitude NUMERIC`, `store_longitude NUMERIC` to `app_settings` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2.  **Master Schema:** Added columns to both `CREATE TABLE` and backup `ALTER TABLE` blocks in `SUPER_MASTER_SCHEMA.sql`.
3.  **Types & Services:** Added `storeType`, `storeLatitude`, `storeLongitude` to `AppSettings` interface, `mapSettings`, and `toRemoteSettings`.
4.  **Defaults:** `storeType: 'both'` in `SupabaseAppContext.tsx` defaults.
5.  **UI:** Store Type selector (Physical/Online/Both), Shop Location lat/lng inputs with "Use Current Location" button, and Max Radius field consolidated into single "Shop Location & Delivery Area" section in `Settings.tsx`.
6.  **Store Checkout:** Self Pickup tab shows shop location + "Get Directions" Google Maps link.

### [2026-07-15] Delivery & Pickup Operating Hours
**Files:** `types/index.ts`, `SUPER_MASTER_SCHEMA.sql`, `services.ts`, `SupabaseAppContext.tsx`, `Settings.tsx`, `StoreCheckout.tsx`, `EStoreApp.tsx`, `supabase/migrations/20260715010000_delivery_pickup_hours.sql`
**Changes:**
1. **Schema Migration:** `supabase/migrations/20260715010000_delivery_pickup_hours.sql` adds `shop_open_time TIME`, `shop_close_time TIME`, `delivery_start_time TIME`, `delivery_end_time TIME`, `pickup_start_time TIME`, `pickup_end_time TIME` to `app_settings`.
2. **Master Schema:** Added columns to `CREATE TABLE` + post-launch `ALTER TABLE` block in `SUPER_MASTER_SCHEMA.sql`.
3. **Types & Services:** New fields in `AppSettings`; mapped in `mapSettings`/`toRemoteSettings`.
4. **Default values:** Added to `SupabaseAppContext.tsx` defaults.
5. **Settings UI:** "Fulfillment Methods (KFC Style)" section now has Shop Hours (master boundary), Delivery Hours, and Pickup Hours with time inputs — each method's toggle + time range in its own card.
6. **Checkout:** Delivery/Pickup tabs auto-disable outside their hours with clock icon + time range shown. Auto-switches selection if current mode becomes unavailable.
7. **EStoreApp:** Sticky header banner shows "Store Closed — Open HH:MM–HH:MM" (red) / "Delivery available HH:MM–HH:MM — Pickup only" (amber) based on current time.

### [2026-07-15] Bundle / Deal Scheduling with Live Countdown
**Files:** `types/index.ts`, `SUPER_MASTER_SCHEMA.sql`, `services.ts`, `BundleManager.tsx`, `StoreFront.tsx`, `StoreDealModal.tsx`, `ProductGrid.tsx`, `StoreSort.tsx`, `supabase/migrations/20260715000000_bundle_scheduling.sql`, `hooks/useScheduleStatus.ts`
**Changes:**
1. **Schema Migration:** `supabase/migrations/20260715000000_bundle_scheduling.sql` adds `schedule_type TEXT`, `start_date DATE`, `end_date DATE`, `repeat_days TEXT[]`, `start_time TIME`, `end_time TIME` to `bundles` table.
2. **Master Schema:** Added columns to `CREATE TABLE IF NOT EXISTS bundles` in `SUPER_MASTER_SCHEMA.sql`.
3. **Types:** Added `ScheduleType = 'always' | 'scheduled'` and fields `scheduleType`, `startDate`, `endDate`, `repeatDays`, `startTime`, `endTime` to `Bundle` interface.
4. **Services:** Updated `mapBundle`, `bundlesService.create`, `bundlesService.update` to map and persist schedule fields.
5. **Hook:** Created `hooks/useScheduleStatus.ts` with `isBundleInSchedule()`, `getTimeRemainingMs()`, and `useScheduleStatus()` hook returning `{ isScheduleActive, timeRemaining, isHotDeal }`.
6. **BundleManager.tsx:** Added "Deal Schedule" section with Always On / Scheduled toggle, date range pickers, Mon-Sun day toggles, time window inputs. Schedule fields passed to create/update/dispatch.
7. **StoreFront.tsx:** Bundles filtered by schedule. Deal cards show live countdown timer (`DealCountdown` component) + flame icon on discount badge for scheduled deals.
8. **StoreDealModal.tsx:** Modal shows "Hot Deal" badge + countdown timer for scheduled bundles.
9. **ProductGrid.tsx (POS):** Bundles filtered by schedule. BundleCard shows flame icon on discount badge for scheduled deals.
10. **StoreSort.tsx:** Deals tab shows schedule summary (date/time) next to deal type.

### [2026-07-15] 24-Hour Cancelled Orders Auto-Deletion System
**Files Updated:** `syncEngine.ts`, `AGENTS.md`, `GEMINI.md`
**Changes:**
1.  **Automatic Retention Loop (`syncEngine.ts`)**:
    *   Authored `pruneExpiredCancelledOrders()` query utility using Dexie `localDb.sales` indexing on `status` to isolate cancelled orders.
    *   Filtered matches older than 24 hours (calculated via local timestamp vs. cutoff Date object) and purged them locally using `.bulkDelete()`.
    *   Executed corresponding cloud deletion command targeting Supabase server `sales` table to sync the state.
    *   Hooked execution into app initialization (`startSyncEngine`) and the 1-hour auto-recovery timer interval.
2.  **Documentation updates (`AGENTS.md`, `GEMINI.md`)**:
    *   Documented system design and operational rules for future auto-deletion extensions.

### [2026-05-19] Universal Code 128 Barcode System Implementation
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `schema.prisma`, `localDb.ts`, `services.ts`, `barcode.ts`, `BarcodePreview.tsx`, `ProductModal.tsx`, `ProductDetailHub.tsx`, `InventoryManager.tsx`, `useHardwareScanner.ts`, `POSTerminal.tsx`, `ProductGrid.tsx`, `BarcodeGenerator.tsx`, `ReceiptPrint.tsx`, `DatabaseTools.tsx`, `Settings.tsx`
**Changes:**
1.  **Database & Schema Parity (`SUPER_MASTER_SCHEMA.sql`, `schema.prisma`, `localDb.ts`)**:
    *   Added `barcode_value TEXT` column and `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_value` across SQL schemas and Prisma models. Bumped Dexie IndexedDB version to v12 to seamlessly register `barcodeValue`.
2.  **Robust Code 128 Generation (`barcode.ts`, `BarcodePreview.tsx`)**:
    *   Installed `jsbarcode` and authored standard generation utility (`generateBarcodeValue`) outputting formatted `ZP-{5-digit padded integer}` hashes derived from UUID keys. Created beautiful high-fidelity SVG preview component (`BarcodePreview`) for crisp rendering across table cells and dialogs.
3.  **Universal Inventory & POS Barcode Integration (`ProductModal`, `ProductDetailHub`, `InventoryManager`, `POSTerminal`, `ProductGrid`)**:
    *   Added live Code 128 SVG previews and auto-generation across Add & Edit product modals. Embedded inline barcode display cells into inventory tables. Built custom hardware scanner hook (`useHardwareScanner`) with 50ms rapid USB HID keystroke buffering and integrated it into POS for instantaneous scan-to-cart operations.
4.  **Hardware Printing Parity (`BarcodeGenerator.tsx`, `ReceiptPrint.tsx`)**:
    *   Updated barcode sticker generator and checkout receipts to prioritize and print crisp Code 128 SVGs compatible with all laser/thermal scanners.
5.  **Admin Database Seeding (`DatabaseTools.tsx`, `services.ts`)**:
    *   Created `seedMissingBarcodes` and `auditStockIntegrity` functions and added one-click trigger buttons in the Database Management settings panel for effortless system maintenance.

### [2026-05-19] Universal Guide Tooltips & POS / Checkout Audit Parity
**Files Updated:** `HelpTooltip.tsx`, `ProductModal.tsx`, `ProductDetailHub.tsx`, `Cart.tsx`, `CheckoutModal.tsx`, `CheckoutPage.tsx`
**Changes:**
1.  **State-of-the-Art Accessible Help Tooltips (`HelpTooltip.tsx`)**:
    *   Created an inline, fully animated hover and click tooltip component (`HelpTooltip`) equipped with a subtle trigger icon, z-index isolation (`z-[700]`), and pointer-event passthrough to explain advanced features without cluttering the UI or blocking interactions.
2.  **Product Management Tooltips (`ProductModal.tsx`, `ProductDetailHub.tsx`)**:
    *   Embedded expert-density tooltips across Add and Edit Product dialogs explaining Core Identifiers (Name, SKU, Barcode, Category, Supplier), Inventory Financials & Controls (Price, Cost, Active Tracking, Initial Stock, Low Stock Warning), and POS Enhancements (Service Item vs Tracked Item, IMEI/Serial Device Prompt).
3.  **Active POS Cart Tooltips (`Cart.tsx`)**:
    *   Added helpful tooltips explaining Cart Session accumulation, Instant Cart Wiping (Clear Cart), Editing Sale atomic replacement, Customer Linking (Credit tracking, loyalty, WhatsApp receipt), Bill-wide Discount controls, and Save Draft / Hold Order functionality.
4.  **Checkout & Settlement Parity Tooltips (`CheckoutModal.tsx`, `CheckoutPage.tsx`)**:
    *   Added detailed tooltips to Payment Methods (Cash, Credit Debt, Split mixed tenders), Delivery Challan (DC Number) shipping references, Other Extra Amounts (Delivery fees, packaging), and Internal Memos for dispatch records.
5.  **Module Import Resolution (`CheckoutPage.tsx`)**:
    *   Fixed a syntax error where `queueOp` was incorrectly imported from `services` instead of `localDb`, guaranteeing flawless build execution and offline queue hydration during standalone checkout.

### [2026-05-19] Offline Persistence & Reporting Parity Fixes
**Files Updated:** `services.ts`, `ReportsManager.tsx`, `TransactionsManager.tsx`
**Changes:**
1.  **Universal `workspaceId` Hydration (`services.ts`)**:
    *   Resolved a critical bug where objects mapped from Supabase rows (`mapProduct`, `mapCustomer`, `mapSale`, `mapExpense`, `mapUser`, `mapShift`, `mapDiscount`, `mapPurchaseRecord`, `mapProductBatch`, `suppliers`, `supplier_transactions`, `stock_history`) failed to map `item.workspace_id` to `item.workspaceId`. When saved to local IndexedDB (`localDb`), records lacked the `workspaceId` property, causing local and fallback reporting queries to return empty data offline or upon reload.
2.  **Robust Local Filter Parity (`services.ts`)**:
    *   Updated `getReportSalesLocal`, `getReportSales` fallback, `getReportRefundsLocal`, `getReportRefunds` fallback, `getReportExpensesLocal`, `getReportExpenses` fallback, and `searchSales` fallback to accept both `workspaceId` and `workspace_id` properties.
3.  **Reporting State Hydration (`ReportsManager.tsx`)**:
    *   Ensured `setReportSales`, `setReportRefunds`, and `setReportExpenses` are always executed during local database fetch, eliminating stale report data when querying date ranges with empty results.
4.  **Offline Transaction Search (`TransactionsManager.tsx`)**:
    *   Removed `navigator.onLine` block during search, allowing the app to seamlessly execute local IndexedDB search fallback when offline or disconnected.

### [2026-05-19] Financial Flow Audit & Credit Sales Reporting Parity
**Files Updated:** `services.ts`, `ReportsManager.tsx`, `DashboardManager.tsx`, `CheckoutModal.tsx`, `POSTerminal.tsx`
**Changes:**
1.  **Cloud Stock Sync Fix on Return/Refund (`services.ts`)**:
    *   Discovered and resolved a critical omission in `returnSale` where restored product stock was updated locally but never queued for cloud synchronization via `queueOp('products', ...)`. Perfect cloud vs. local inventory sync restored.
2.  **Reporting & Dashboard Revenue Parity (`ReportsManager.tsx`, `DashboardManager.tsx`)**:
    *   Identified a major reporting discrepancy where credit sales (`status === 'credit'`) were omitted from revenue totals, transaction counts, feature analytics, and dashboard hourly charts while their COGS was still being counted.
    *   Standardized status checks (`s.status === 'completed' || s.status === 'credit'`) across all revenue and transaction metrics to ensure 100% accurate profit and revenue calculations.
3.  **Cash Drawer Verification Parity (`CheckoutModal.tsx`)**:
    *   Updated cash sales calculation for drawer opening cash validation to accurately include cash portions of split credit sales.
4.  **Code Cleanup**:
    *   Removed unused legacy import in `POSTerminal.tsx`.

### [2026-05-19] Comprehensive App Audit, Date Parity & Unlocking Intelligence Reports
**Files Updated:** `ReportsManager.tsx`, `TransactionsManager.tsx`, `ExpenseManager.tsx`, `PurchaseHistory.tsx`
**Changes:**
1.  **ReportsManager Unlocked Premium Tabs**:
    *   Exposed previously hidden `CUSTOMERS` and `EXPENSES` intelligence reports in chip navigation bar and JSX render layout.
2.  **Universal Date Filtering Perfection**:
    *   Added standard `ALL TIME` (`all`) option across `ReportsManager`, `TransactionsManager`, `ExpenseManager`, and `PurchaseHistory` date range selector dropdowns.
    *   Standardized date boundaries across all filtering hooks to ensure 100% calculation parity.
3.  **Complexity Cleanup**:
    *   Removed unused legacy `shiftFilter` state and filtering logic from `TransactionsManager` to maintain clean architecture.

### [2026-05-19] Edit Product Sync + Customer Module Simplification
**Files Updated:** `ProductDetailHub.tsx`, `CustomerModal.tsx`, `CustomerDetailModal.tsx`
**Changes:**
1.  **ProductDetailHub (Edit Mode) — Full Universal POS Parity**:
    *   Added `isService` toggle: Marks product as a service (disables stock tracking auto).
    *   Added `requireSerial` toggle: Forces IMEI/Serial prompt at POS for this product.
    *   Added `variants` builder: Add/remove size, color, material variant options (matches ProductModal).
    *   Added `modifiers` builder: Add/remove add-ons with pricing (e.g. Extra Cheese, Warranty).
    *   All 4 new fields now saved on product update via `productsService.update()`.
2.  **Customer Module Simplification**:
    *   Replaced all complex CRM/tech jargon with plain English labels.
    *   "Intelligence Profile" → "Details", "Purchase Archive" → "Transactions".
    *   "Settlement Core" → "Add Payment", "Liability Balance" → "Amount Due".
    *   "Commit Settlement" → "Add Payment", "Cash Flow" → "Cash", "E-Transfer" → "Bank Transfer".
    *   "Close Profile" → "Close", error messages simplified throughout.
    *   No functional changes — all existing payment and data linkages preserved.

### [2026-05-19] Universal Date Filtering Parity & Dynamic Ledger Sync
**Files Updated:** `CustomerManager.tsx`, `SupplierManager.tsx`, `SupplierLedger.tsx`
**Changes:**
1.  **CustomerManager Date Filtering**:
    *   Standardized date selection dropdown (`today`, `yesterday`, `last7`, `thisMonth`, `lastMonth`, `custom`, `all`).
    *   Implemented dynamic customer purchases calculation (`getCustomerTotalPurchases`) to reflect active date range instantly on table rows and mobile summary cards.
2.  **Supplier Module Parity**:
    *   Standardized date boundaries and selector options in `SupplierManager.tsx`.
    *   Passed date boundaries (`validStartDate`, `validEndDate`) down to `SupplierLedger.tsx`.
    *   Filtered supplier ledger transactions dynamically to ensure absolute date filtering parity across the supply chain module.

### [2026-05-19] Modal Top Cropping Fix & POS Universal Enhancements Parity
**Files Updated:** `ModernModal.tsx`, `CheckoutPage.tsx`, `CheckoutModal.tsx`, `InventoryManager.tsx`
**Changes:**
1.  **Modal Top Cropping Permanent Fix (`ModernModal.tsx`)**:
    *   Resolved a flexbox centering layout bug where tall modals (like the Product Modal or Bulk Edit Modal) were cropped at the top edge of the screen on desktop and mobile viewports.
    *   Replaced `items-center` with `items-start pt-16 sm:pt-20 pb-16` and applied `my-auto` to the modal container. If the modal is shorter than the viewport, it perfectly centers vertically; if taller, it aligns to the top padding, guaranteeing full scrollability without clipping the top close button or headers.
2.  **Universal POS Enhancements Parity (`CheckoutPage.tsx`, `CheckoutModal.tsx`, `InventoryManager.tsx`)**:
    *   Audited the full flow for `isService` (Service Items without stock) and `requireSerial` (IMEI/Serial scanning prompt at POS).
    *   Added full rendering support for `selectedVariant`, `selectedModifiers` (add-ons), and `serialNumber` directly into the order summary items list on `CheckoutPage.tsx` and `CheckoutModal.tsx`, matching the existing high-fidelity display in `Cart.tsx` and `ReceiptPrint.tsx`.
    *   Added dedicated Item Type filter (`All Items`, `Standard Products`, `Service Items`, `IMEI / Serialized`) and visual pill badges directly to the main `InventoryManager.tsx` table and mobile cards for premium expert density and rapid filtering.

### [2026-05-19] Complete Link Tree Audit, Module ACL & Atomic POS Bill Edit Parity
**Files Updated:** `types/index.ts`, `App.tsx`, `Header.tsx`, `UserModal.tsx`, `SupplierLedger.tsx`, `ExpenseManager.tsx`, `CheckoutPage.tsx`
**Changes:**
1.  **Users & Permissions Link Tree & Module Access Control (`types/index.ts`, `UserModal.tsx`, `Header.tsx`, `App.tsx`)**:
    *   Synchronized active navigation route matching in `App.tsx` and module tab visibility in `Header.tsx`.
    *   Added full granular Module Access Control checkboxes (`access_inventory`, `access_expenses`, `access_customers`, `access_reports`) directly into `UserModal.tsx` for real-time permission toggling.
2.  **Supplier & Expenses Link Tree (`SupplierLedger.tsx`, `ExpenseManager.tsx`, `types/index.ts`)**:
    *   Enforced active shift validation before recording supplier payments or manual expenses.
    *   Added missing `workspaceId`, `workspace_id`, and `addedBy` fields to `Expense` interface and ensured auto-generated expenses correctly hydrate them for flawless offline and reporting sync.
3.  **POS Atomic Bill Edit Parity (`CheckoutPage.tsx`)**:
    *   Standardized the state-of-the-art safe two-phase create-then-delete bill editing pattern with fallback voiding in `CheckoutPage.tsx` to perfectly mirror `CheckoutModal.tsx`, eliminating any potential for corrupted inventory or lost revenue during bill edits.

### [2026-05-18] Universal POS Products & Advanced Reporting
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `prisma/schema.prisma`, `types/index.ts`, `services.ts`, `ProductModal.tsx`, `POSTerminal.tsx`, `Cart.tsx`, `ReceiptPrint.tsx`
**Changes:**
1.  **Products Table**:
    *   Added `is_service` (BOOLEAN): Flags items as services (no stock tracking needed).
    *   Added `require_serial` (BOOLEAN): Forces prompt for IMEI/Serial scanning at POS.
    *   Added `variants` (JSONB): Stores size/color configurations.
    *   Added `modifiers` (JSONB): Stores add-ons and extra charges for cafes/restaurants.
2.  **Reporting**:
    *   Standardized date filtering (`date-fns`) across all reports.
    *   Added `recentSales` ledger in `InventoryReportManager` to track item-level sales dates.

### [2026-05-09] POS Enhancements, Split Payments & DC Charges
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `prisma/schema.prisma`, `localDb.ts`, `types/index.ts`, `services.ts`
**Changes:**
1.  **Sales Table**:
    *   Added `extra_charges` (JSONB): Consolidated DC and other charges into a single flexible array.
    *   Added `split_payments` (JSONB): Support for multi-method payments.
    *   Removed legacy `dc_number`, `other_amount` columns.
2.  **App Settings Table**:
    *   Added `enable_split_payment` (BOOLEAN): Toggle for multi-payment UI.
    *   Added `enable_extra_charges` (BOOLEAN): Toggle for DC Charges (E-Store only).
    *   Added `allow_credit_over_limit` (BOOLEAN): Enforcement of customer credit limits.
    *   Added advanced Barcode settings: `barcode_content_scale`, `barcode_font_size`, `barcode_name_lines`, etc.
    *   Added `pos_grid_columns` (INTEGER): Configurable POS layout.
3.  **Realtime**:
    *   Updated `supabase_realtime` publication to include all new core tables.

### [2026-05-09] Audit Fixes — split_payments, RLS, get_my_workspace_id
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `supabase/migrations/20260509191900_split_payments_rls_fix.sql`
**Changes:**
1.  **Sales Table**:
    *   `split_payments` column was in schema & code but NOT in live DB. Applied `ALTER TABLE sales ADD COLUMN IF NOT EXISTS split_payments JSONB DEFAULT '[]'`.
2.  **RLS Security**:
    *   `get_my_workspace_id()` function was missing from live DB — deployed as SECURITY DEFINER.
    *   `app_settings` policies were `qual=true` (allowed all rows) — replaced with workspace-scoped SELECT/INSERT/UPDATE/DELETE policies.
    *   `users` SELECT/UPDATE policies were `qual=true` — replaced with `id = auth.uid() OR workspace_id = get_my_workspace_id()`.
    *   SUPER_MASTER_SCHEMA.sql updated to deploy function + policies in correct order on fresh installs.
3.  **Audit Finding — Batch NULL** (data issue, not code):
    *   12 products have `track_inventory=true`, but only 1 has rows in `product_batches`.
    *   Root cause: products created before FIFO batch system was deployed.
    *   Code correctly handles this (FIFO logic skips if no batches, falls back to product.cost).
    *   No code fix needed — data-level backfill can be done manually if COGS precision is required.

# 📝 TASK MANAGEMENT RULE (MANDATORY)

For every large or multi-step task, you MUST create a `todo.md` file in the project root to plan and track your progress.
1. Break down the task into clear, actionable steps.
2. Check off items as you complete them.
3. This ensures you do not forget pending items and allows you to work faster without repeatedly scanning or reading the same files.

---

# 🌳 LINK TREE & DOCUMENTATION RULE (NEW)

**Whenever a task is completed, you MUST ALWAYS:**
1. Document the exact files you created/modified in a "Link Tree" format at the end of your response.
2. If ANY database schema (SQL, localDb) or data types (`types/index.ts`) were changed, YOU MUST ADD A LOG ENTRY to the **SCHEMA CHANGE LOG** in this `GEMINI.md` file. Never skip this step.

---

# 🚀 Zaynahs POS - Supabase Project Clone Guide

Jab bhi aap is project ko kisi **naye Supabase project** par shift (clone) karein, toh yeh guide follow karein taake koi error na aaye aur database sleep na ho.

> ⚡ **No Prisma, no psql, no Dashboard needed.** Sab kuch Management API (`sbp_` token) se hoga. See [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for reference.

---

## STEP 1: Credentials Update (Env Variables)
Sab se pehle naye Supabase project ki details in 2 files mein update karein:

1. **`.env.local`** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MGMT_API_KEY`
2. **`.env`** (Root folder mein) — same values

> `SUPABASE_MGMT_API_KEY` wohi `sbp_...` token hai jo aapne pehle [Supabase Dashboard → Access Tokens](https://supabase.com/dashboard/account/tokens) se generate kiya tha. Ek hi token sab projects ke liye kaam karta hai.

---

## STEP 2: Database Schema Push
Management API ke zariye database tables banayein (koi Prisma / psql nahi):

```bash
# 1. Pehle project ref nikaalo (agar nahi pata)
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"

# 2. Schema push karo via Management API
SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
curl -X POST "https://api.supabase.com/v1/projects/{ref}/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA_JSON"
```

---

## STEP 3: Admin User Setup (Most Important)
Naye project mein login ka issue na aaye, iske liye yeh lazmi karein:

1. **Email Confirmation OFF karein** (via Management API):
   ```bash
   curl -X PATCH "https://api.supabase.com/v1/projects/{ref}/config/auth" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"SAML_EXTERNAL_EMAIL_ENABLED": false}'
   ```
   Ya **Dashboard** > **Authentication** > **Settings** > `Confirm Email` OFF kar dein.

2. **Naya Admin Banayein** (via Management API, Dashboard ki zaroorat nahi):
   ```bash
   # Pehle anon aur service_role keys nikaalo
   KEYS=$(curl -s "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY")
   ANON=$(echo $KEYS | python3 -c "import json,sys; keys=json.load(sys.stdin); print([k['api_key'] for k in keys if k['name']=='anon'][0])")
   SERVICE=$(echo $KEYS | python3 -c "import json,sys; keys=json.load(sys.stdin); print([k['api_key'] for k in keys if k['name']=='service_role'][0])")
   SUPABASE_URL="https://{ref}.supabase.co"

   # Admin user banao
   curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
     -H "Authorization: Bearer $SERVICE" \
     -H "apikey: $ANON" \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@email.com", "password": "Admin@123", "email_confirm": true}'
   ```
   *Note: Kyunke humne `SUPER_MASTER_SCHEMA.sql` mein auto-admin trigger add kar diya hai, jo bhi project ka **pehla user** banega woh khud-ba-khud **Admin** ban jayega.*

---

## STEP 4: Keep Database Alive (Sleep Prevention)
Supabase ka free plan 1 hafte baad database pause kar deta hai. Isey 24/7 active rakhne ke liye sab se asaan auto-ping setup karein (ismein kisi api key/header ki zaroorat nahi):

1. **cron-job.org** par jayen aur free account banayen.
2. **Create Cronjob** par click karein.
3. **COMMON Tab Settings:**
   * **Title**: `Supabase Keep Alive`
   * **URL**: `https://[AAPKA_SUPABASE_ID].supabase.co/auth/v1/health` (Yeh public link hai)
   * **Execution schedule**: `Every 3 days` (Ya Every day)
4. **ADVANCED Tab Settings:**
   * Neechay ja kar **Headers** mein 2 lines add karein:
     * **Header 1** -> Key: `apikey` | Value: `[Aapki_Anon_Key]`
     * **Header 2** -> Key: `Authorization` | Value: `Bearer [Aapki_Anon_Key]`
5. **SAVE** karein aur ek dafa **TEST RUN** daba kar check karein ke **200 OK** aa raha hai ya nahi.

---
### [2026-07-10] POST_DUMP_REPAIR removed, merged into SUPER_MASTER_SCHEMA
**Files Updated:** `supabase/schema/SUPER_MASTER_SCHEMA.sql` (+data integrity section), `supabase/migrations/20260710020000_create_missing_bundle_tables.sql` (+GRANTs)
**Changes:**
1.  **POST_DUMP_REPAIR.sql** deleted — all content already existed in SUPER_MASTER_SCHEMA.sql (columns, indexes, functions, RLS, replica identity, realtime). Only data integrity backfill (product_batches + stock_history) was missing — now added at the end.
2.  **bundle_slots & bundle_slot_options** created via migration + GRANT SELECT added for anon/authenticated/service_role.
3.  `AGENTS.md` & `GEMINI.md` migration rules updated — removed POST_DUMP_REPAIR references.

### [2026-07-10] Drop workspace_id — Single-tenant architecture
**Files Updated:** All app code (services.ts, components, types, hooks, etc.), `src/lib/localDb.ts`, `src/lib/masterSchema.ts`, `src/lib/constants.ts`, `supabase/schema/SUPER_MASTER_SCHEMA.sql`, `supabase/migrations/20260710030000_drop_workspace_id.sql`
**Changes:**
1.  **Migration run:** `workspace_id` column dropped from all 18 tables (app_settings, categories, customers, suppliers, products, product_batches, discounts, users, sales, expenses, sales_tabs, purchase_records, purchase_orders, purchase_order_items, supplier_transactions, payments, stock_history, bundles).
2.  **Index:** `idx_bundles_name_workspace` → `idx_bundles_name_unique` (unique bundle name globally, not per-workspace).
3.  **Functions:** `get_my_workspace_id()` returns `auth.uid()`. `handle_new_user()` no longer sets workspace_id. `process_sale()` RPC no longer reads/writes workspace_id.
4.  **App code:** All `.eq('workspace_id', ...)` filters, workspaceId params, mappers returning workspaceId, and useWorkspaceId hook removed. BundleGrid cards now have ± quantity stepper.
5.  **1 Clone = 1 Shop** — changing project credentials no longer causes workspace_id mismatch issues.

### [2026-07-10] Remote Column Parity, Settings Realtime Filter, and Bundle Quantity Stepper Fix
**Files Updated:** `supabase/schema/SUPER_MASTER_SCHEMA.sql`, `supabase/migrations/20260710164500_add_variant_data_modifiers_to_products.sql`, `src/context/SupabaseAppContext.tsx`, `src/components/pos/ProductGrid.tsx`, `src/components/settings/Settings.tsx`, `src/main.tsx`
**Changes:**
1.  **Database Columns Parity (`SUPER_MASTER_SCHEMA.sql`, `20260710164500_add_variant_data_modifiers_to_products.sql`)**:
    *   Applied live `ALTER TABLE products ADD COLUMN` migration for `variant_data` and `modifiers` JSONB fields. Added log entries to schema change log. Resolves the product sync 400 Bad Request error.
2.  **Defensive Singleton Settings Sync (`SupabaseAppContext.tsx`, `Settings.tsx`)**:
    *   Filtered the Realtime `app_settings` subscription to only apply changes when `payload.new.id === SETTINGS_ID`.
    *   Forced the local IndexedDB settings loader to find the record matching `SETTINGS_ID`.
    *   Standardized theme default values in `Settings.tsx` to `'dark'` to match `index.html` and the context initialization.
    *   Resolves settings (theme, POS columns) changing automatically and reverting from 7 to 4 when other clients updated their settings records.
3.  **Active Bundle Stepper Controls (`ProductGrid.tsx`)**:
    *   Replaced the hardcoded '1' value on the bundle grid cards with the calculated `bundleQty` in cart.
    *   Rewrote the bundle increment/decrement quantity logic so that pressing `-` reduces the quantity incrementally (e.g. 3 -> 2 -> 1 -> delete) rather than wiping the entire item immediately. Matches normal product card density stepper controls.
4.  **Quiet Consoles (`main.tsx`, `SupabaseAppContext.tsx`)**:
    *   Configured React Router v7 future flags (`v7_startTransition`, `v7_relativeSplatPath`) on `<BrowserRouter>` to silence upgrade warnings.
    *   Downgraded realtime disconnect/retry console logs from warning (`console.warn`) to standard info (`console.log`) level.
### [2026-07-14] E-Store Integration - Phase 1 Schema
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`
**Changes:**
1.  **products table:** Added `show_in_estore BOOLEAN DEFAULT true` to control online visibility.
2.  **sales table:** Added `estore_status TEXT DEFAULT 'pending'`, `delivery_address TEXT`, `delivery_fee DECIMAL(12,2) DEFAULT 0`, `customer_notes TEXT`.
3.  **Idempotent Schema:** Added `ALTER TABLE ADD COLUMN IF NOT EXISTS` block in `SUPER_MASTER_SCHEMA.sql` for post-launch updates.

✅ **All Done!**