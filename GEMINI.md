# 🏗️ Zaynahs POS — MASTER RULES (ALL FIXES MERGED)
> Every known bug is addressed here permanently. Yeh file AI agents ke liye single source of truth hai.

> ⚡ **Supabase Management API Only** — All database operations MUST use the `sbp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` token + curl/API. 
> Prisma and direct DB connections have been completely removed. See [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for complete API reference.

---

## 🚀 MANDATORY PROJECT PUSH RULE (MANDATORY)

- **Push Everywhere:** Whenever you make ANY code change, bug fix, or schema update, you MUST ALWAYS push the updated code to ALL active clone projects immediately.
- **Command:** `git push origin main` (har active clone ka apna repo/remote — current list: `zaynahspos v2` single project)
- **Never Skip:** Never assume a fix is just for one project. Code updates must be synced globally so all clones stay 100% identical.



## 🌍 UNIVERSAL REUSABILITY RULE (MANDATORY)

- **Code is Universal:** This system is designed for **multiple clones/shops**. NEVER fix a bug, UI issue, or add a feature in a "shop-specific" or "one-off" way.
- **Global Code Changes:** ALL fixes (whether it's CSS, layout, logic, or bug fixes) MUST be implemented in the core codebase (`src/`, `index.css`, `shared/`) so that the exact same code runs universally across all current and future clones.
- **Future-Proofing:** Every time you write code, ask yourself: *"Will this work seamlessly on the next new clone without any manual changes?"* If the answer is no, your code is wrong.

## 🧩 SHARED MODULES UNIVERSAL RULE (MANDATORY — ANTI-AI-BREAKABLE)

**THE SYSTEM IS ONE SHARED DESIGN LANGUAGE. NO DUPLICATES. NO VARIANTS. NOWHERE.**

- **Single Source of Truth:** Har cheez EK hi shared module se aati hai — `src/shared/ui/` (Button, Card, Badge, Modal, Dialog, BottomSheet, Select, DateRangePicker, Pagination, EmptyState, ToggleSwitch, SegmentedControl, Avatar, LoadMoreButton) aur `src/shared/modules/search-and-list/` (SharedSearchBar, SharedProductList, useDragDropList).
- **Icons:** Ek hi icon set (Lucide) sab jagah — har page/component me alag alag icon pack/emoji ban. Icons sirf shared wrappers se import.
- **Buttons:** `.btn-md` default — sab buttons shared `Button` se. Page-local button styling BANNED.
- **Modals & Popups:** Sab modals/dialogs/popups shared `Dialog`/`ModernModal`/`BottomSheet` se. Form modals `maxWidth="lg"|"xl"` + `md:grid-cols-2`. Alag-alag popup implementations BANNED. Mobile pe center (`items-center justify-center`) — bottom sheets never.
- **Media Selection:** ALL image upload/selection (products, deals, settings, logo) MUST route through centralized `MediaLibrary` — direct file-picker triggers BANNED. Compression (WebP 20-50KB) via shared `compressImage`.
- **Drag & Reorder:** Sorted/drag lists shared `useDragDropList` + `DragHandle` se — page-local reorder logic BANNED.
- **Loaders:** Primary loaders sirf `<SkeletonLoader />` — generic spinners BANNED for primary loads.
- **Business Logic:** Ek hi shared helper (`commitStockInToInventory` = ONLY stock-in path). Parallel implementations BANNED (AGENTS.md rule 18).
- **POS Exemption ONLY:** `src/components/pos/**` is the ONLY folder exempt from shared UI (fast dense UI), BUT logic/rules F1-F23 still apply. Estore uses shared wrappers with `!`-prefixed className theme overrides only.
- **Verification:** New page banane se pehle docs/MODULES.md registry check karo — agar module exist karta hai, use karo; naya same-purpose module banane se pehle register aur justify karo.
- **Failure = Rule Violation:** Koi bhi page jo shared module ko copy-paste karke alag version banaye, usse REJECT karo aur shared se replace karo.

## 🧩 FEATURE PLAN — POS PRODUCT SORT (STORE SORT MIRROR)

**Goal:** POS product grid pe bhi wahi drag up/down sort system chahiye jo `STORE SORT` (`/inventory/store-sort`) mein hai — cashier apni POS grid me products arrange kar sake.

**MANDATORY design (anti-AI-breakable):**
1. **Shared module ONLY:** Sort UI `useDragDropList` + `DragHandle` (src/shared/modules/search-and-list) se banega. STORE SORT ka same look/feel. Custom drag logic BANNED.
2. **Trigger:** POS header me `Sort` button (Grid Density controller ke paas) → Sort Mode on. Ya product card pe grip icon jo sirf Sort Mode me visible ho.
3. **Persistence:** Order `app_settings` JSON field `pos_product_order` me save (structure: `{ [categoryId|'all']: string[] /* product IDs */ }`) — bilkul STORE SORT ki tarah. No new table needed.
4. **Scope:** Per-category ordering (har category apni order). Category switch par respective order apply.
5. **Sync:** Local-first → Dexie `appSettings` + `queueOp('app_settings','update')` + `dispatch SET_SETTINGS` (settings singleton pattern follow karo).
6. **Reset:** "Reset to Default" button (clears `pos_product_order` for that category).
7. **Behavior:** Drag → order change → save → grid turant reflect → Sort Mode exit par normal grid.

**Implementation checklist (jab src available ho):**
- [ ] `AppSettings` interface me `posProductOrder?: Record<string, string[]>` add (types/index.ts)
- [ ] `mapSettings`/`toRemoteSettings` me map
- [ ] `SUPER_MASTER_SCHEMA.sql` app_settings ALTER TABLE add (`pos_product_order JSONB DEFAULT '{}'::jsonb`)
- [ ] POS header `Sort` toggle + `useDragDropList` wire
- [ ] ProductGrid reads `pos_product_order[category]` for display order
- [ ] MODULES.md / UI_RULES.md update

> NOTE: Yeh folder me `src/` nahi hai — rule + plan yahan documented hai; actual code tab likhega jab real project folder dikhayein.

# ⛔ RULE #0 — ABSOLUTE PRIME DIRECTIVE
## 🏢 Business Scope & Safety Rules
- **Applies to:** Universal Business System (Clothing, Pharmacy, Restaurant, Retail, Electronics, Mobile, Tech, Shoes, Grocery). NO logic or layout may be hardcoded to a specific niche.
- **Enforced Terminology:** `item` / `product` / `unit` / `category` / `listing` / `variant` / `modifier` / `addon`.
- **Electronics / Tech Tracking:** The system fully supports Serial Number and IMEI tracking via `requireSerial` and `serialNumber` fields. Never assume the POS is only for food or basic retail.


1. **Fulfill the Request**: Modify, refactor, or create exactly what the user asks without hesitation.
2. **Design Parity**: Maintain "Expert Density" aesthetic and established design patterns.
3. **Direct Action**: Find the relevant files and implement the fix directly.
4. **DATA INTEGRITY FIRST**: Financial and stock data is NEVER approximated. If uncertain → throw error, never silently fallback to 0.
5. **🎨 UI TASKS (MANDATORY)**: Before touching ANY UI/UX code (styling, components, layouts, responsiveness, animations), YOU MUST READ [docs/UI_RULES.md](docs/UI_RULES.md) AND [docs/MODULES.md](docs/MODULES.md) FIRST. Failure to do so is a violation of the Prime Directive. UI primitives, search/list/drag modules, and shared business logic MUST come from the shared modules — **always the SAME module everywhere, never page-local variants.**
6. **📏 SIZING RULE (MANDATORY)**: For all new pages and components, Modals MUST use `maxWidth="lg"` or `"xl"` (never sm or md for forms) with a 2-column grid (`md:grid-cols-2`), and ALL buttons MUST include `.btn-md` by default unless specifically overriding.
7. **📱 MOBILE MODAL RULE (MANDATORY)**: All Modals, Popups, and Drawers (including Cart) MUST be displayed in the center of the screen on mobile devices (`items-center justify-center`). NEVER use bottom sheets (`items-end` or `justify-end`) for modals.
8. **STRICT DATABASE POLICY (NO PRISMA)**: Direct DB connections, Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`), and Prisma ORM are completely banned. You must strictly use the Supabase Management API via HTTP/curl for all database schema and data control. Refer to [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for the exact API specifications.
9. **📄 DOCS MUST STAY CURRENT (MANDATORY)**: Every time you change the database schema (columns, tables, indexes, functions) or add a new feature that affects setup/configuration, you MUST:
   - Update `supabase/schema/SUPER_MASTER_SCHEMA.sql` (both CREATE TABLE + ALTER TABLE ADD COLUMN IF NOT EXISTS blocks)
   - Update `docs/setup.md` (add column to post-launch table, update checklist if applicable)
   - Failure to keep both in sync is a violation.
10. **💀 SKELETON LOADING RULE (MANDATORY)**: All loading states for main layout switches, routes, or grid views (storefront, product grid, list pages) MUST use the centralized `<SkeletonLoader />` component (`src/components/common/SkeletonLoader.tsx`) to provide a premium, smooth shimmer load experience. Generic spinner loaders are strictly prohibited for primary loaders.
11. **📚 DOCS STAY CURRENT RULE (MANDATORY)**: `docs/MODULES.md` (shared module registry) and `docs/UI_RULES.md` (design rules) are the live source of truth — **always kept up to date**. Whenever you create a new shared module/component/helper, change a shared module's API, or change any UI rule/pattern, you MUST update BOTH docs in the SAME change — a stale registry is a violation. All new shared modules go under `src/shared/**` with barrel export; parallel/duplicate implementations of shared business logic are BANNED — always import the existing shared one (e.g. `commitStockInToInventory` from `src/lib/stockInCommit.ts` is the ONLY stock-in path).
12. **🛡️ ANTI-AI BREAKABLE UI RULE (STRICT MANDATE)**: You MUST use existing shared modules (`src/shared/*` or `src/components/common/*`) for EVERYTHING. NEVER build separate, page-specific or one-off versions of buttons, icons, popups, media selection libraries, drag-and-drop lists, or search bars. If a popup, button, or icon is used in one place, it MUST be exactly the same (using the shared component) in all other places. Always reuse the shared library of modules. This ensures modern consistency across the entire app and prevents AI from hallucinating custom, broken UI components.

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

## RULE F4 — BILL EDIT MUST BE ATOMIC (create-first + rollback — see F10)

Bill edit = create new sale + delete old sale. These are TWO operations that must behave as ONE.

**The ONLY correct pattern is F10 (create-first, delete-second + rollback). F4's old "delete-first" pattern is BANNED** — if delete succeeds but create fails, stock gets over-inflated and revenue disappears.

> ⚠️ NOTE: Purana F4 delete-first pattern REMOVED (2026-08-16). Sirf F10 pattern valid hai. Yeh rule ab F10 ka reference hai, apna code block nahi.

Required pattern — **F10 (create-first + rollback)**:
```typescript
// CORRECT: Phase 1 create new sale, Phase 2 delete old, failure → rollback Phase 1
try {
  const savedSale = await salesService.create(newSaleData);
  await salesService.delete(oldSaleId);
  return savedSale;
} catch (deleteError) {
  // Rollback the new sale's stock
  try {
    await salesService.delete(savedSale.id, profile?.name || 'Admin');
  } catch (rollbackError) {
    console.error('Failed to rollback new sale stock after edit failure:', rollbackError);
  }
  throw deleteError;
}
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
  .select('total, items, created_at, status')
  .gte('created_at', startDate.toISOString())
  .lte('created_at', endDate.toISOString())
  .neq('status', 'refunded');

const revenue = salesData?.reduce((sum, s) => sum + s.total, 0) ?? 0;
```

---

---

## RULE F7 — SINGLE TENANT ARCHITECTURE
This is a 1 Clone = 1 Shop system. workspace_id and shift_id do NOT exist and should never be used.
**Shift System: PERMANENTLY REMOVED (2026-08-12).** No shift tables/columns/functions anywhere — in code, localDb, or any project DB. Never reintroduce a shift system; tampering will corrupt reports.

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

## RULE F9 — PURCHASE RECORD DELETION MUST RESTORE BATCHES + LOG HISTORY (PERMANENT)

When a purchase record is deleted (`PurchaseHistory.tsx handleDeleteRecord`), the system MUST:

1. **Restore batch qty_remaining** — find the batch(es) associated with the deleted purchase and reduce/remove their `qty_remaining`
2. **Update product.batches[] embedded array** — keep the embedded cache in sync
3. **Log stock_history** — create an entry with type `'adjustment'`, negative `change_qty`, and a note referencing the deleted purchase
4. **Sync all 3 to Supabase** via queueOp

**If you write code that deletes a purchase record WITHOUT restoring its batch → that code is WRONG. Fix immediately.**

```typescript
// CORRECT pattern (in PurchaseHistory.tsx):
// 1. Delete the purchase record
await purchaseRecordsService.delete(record.id);
// 2. Find and reduce batch qty_remaining
// 3. Update embedded product.batches[]
// 4. Log stock_history entry
// 5. Sync to Supabase
```

---

## RULE F10 — BILL EDIT ROLLBACK ON FAILURE (PERMANENT)

Bill edit uses create-first, delete-second pattern. Both CheckoutModal.tsx AND CheckoutPage.tsx MUST:

1. **Phase 1**: Create new sale (deducts stock)
2. **Phase 2**: Delete old sale (restores stock)
3. **If Phase 2 fails**: MUST rollback Phase 1 by calling `salesService.delete(savedSale.id)` to restore the new sale's stock deduction

**If Phase 2 fails and you DON'T rollback Phase 1 → stock is double-deducted. This is a CRITICAL financial bug.**

```typescript
// CORRECT: Both CheckoutModal.tsx AND CheckoutPage.tsx must have this:
} catch (deleteError) {
  // Rollback the new sale's stock
  try {
    await salesService.delete(savedSale.id, profile?.name || 'Admin');
  } catch (rollbackError) {
    console.error('Failed to rollback new sale stock after edit failure:', rollbackError);
  }
  // Then mark old sale as void + show error
}
```

---

## RULE F11 — RECONCILE TOOL MUST EXIST (PERMANENT)

The `reconcileAllStock()` function in `services.ts` and the "Reconcile" button in `InventoryManager.tsx` toolbar MUST always exist. They are the safety net for detecting and fixing stock/batch drift.

- **Function**: `reconcileAllStock(autoFix?: boolean)` in `services.ts`
- **UI**: Purple "Reconcile" button with Shield icon in inventory toolbar
- **Behavior**: Scans all tracked products, compares `products.stock` vs `SUM(product_batches.qty_remaining)`, reports mismatches, optionally auto-fixes

**Never remove this tool. It is the last line of defense against inventory corruption.**

---

## RULE F12 — SINGLE-REVERSAL RULE (PERMANENT)

Every stock reversal happens EXACTLY ONCE, inside the owning service. UI handlers must NEVER reverse stock again after calling the service.

- **Owning services**: `salesService.delete`, `returnSale`, `purchaseRecordsService.delete`
- **Rule**: Deleting ANY purchase record (Stock IN / Adjustment — signed quantity) reverses its ledger effect with exactly ONE `adjustment_out` history entry inside `purchaseRecordsService.delete`.
- **Violation history**: PurchaseHistory double-reversal caused -2×Q on cloud (`2026-08-12` audit C1).

## RULE F13 — DRAFT RULE (PERMANENT)

Drafts (`status:'pending'` / `DRAFT_SALE` note) are saved CARTS, not revenue.

- NEVER deduct/restore stock for drafts
- NEVER touch customer stats (creditUsed, totalPurchases)
- NEVER appear in `getReportSales`/`getReportRefunds` (`.neq('status','pending')`)
- Guards live in `salesService.create` (`skipStockEffects`) + `salesService.delete` (`!isDraftSale`)
- UI: `POSTerminal.saveDraft` saves with `status:'pending'` (never `completed`)

## RULE F14 — NEVER TRUNCATE FINANCIAL DATA (PERMANENT)

- NO `.limit()` or `.slice(0, N)` on sales/expenses/payments/refunds for totals or reports — use `fetchAllPages()`.
- `state.sales` must hold ALL sales (list views paginate themselves).
- Violation history: 1000-sale slice corrupted dashboard/transactions totals; 200/5000 caps on report+search queries.

## RULE F15 — PARTIAL-REFUND DEDUPE (PERMANENT)

`partially_refunded` sales appear in BOTH `getReportSales` AND `getReportRefunds` → merging with `[...sales, ...refunds]` subtracts refundedAmount TWICE.

- Merge by sale id — reportSales copy wins, refunds only add NEW ids.

## RULE F16 — WALLET COLLECTIONS EXCLUDE REFUND PAYOUTS (PERMANENT)

- Refund payouts are `direction:'out'` — collections/totals MUST exclude them (`p.direction !== 'out'`).
- Wallet totals MUST subtract refunded sales (full = full method share, partial = prorated for split) everywhere (ReportsManager + TransactionsManager together).

## RULE F17 — QUEUE MERGE RULES (localDb.queueOp) (PERMANENT)

- A queued `delete` MUST survive later update/upsert attempts (delete wins — never resurrect financial records).
- Merging MUST reset `retries: 0` + `status:'pending'` — no zombie ops that fail both the retry filter and error-recovery filter.

## RULE F18 — REALTIME CONFLICT GUARDS (PERMANENT)

- Sales UPDATE events must skip rows with a pending local change / isPendingDelete — remote value is older than local intent.
- Realtime `stock_history` rows must be `mapStockHistory`-mapped — raw snake_case rows break report readers and the 90-day/5000-cap prune.

## RULE F19 — FETCH FAILURE NEVER WIPES CACHE (PERMANENT)

`.catch(() => [])` on a leading merge source = local cache wipe (payments ledger). On failure, merge from the CURRENT local rows (identity no-op).

## RULE F20 — NO SILENT FINANCIAL OP DROPS (PERMANENT)

- Type/constraint errors (`22P02`/`22003`/`23514`) mark ops `error` for owner review — NEVER hard-delete financial ops from the queue.
- Duplicate-key drops only for `sales` create (invoice collision RPC path).
- Sync timeout must NOT release `_isSyncing` mid-batch (avoids double execution).

## RULE F21 — STALE-WRITE GUARD (PERMANENT — cross-device conflict endgame)

- **Problem:** Device A cancels/deletes a record; Device B's stale bill-edit syncs later with `.upsert()` → the deleted record RESURRECTS (was last-write-wins).
- **Server-enforced solution (DB):**
  - `row_tombstones(table_name, ref_id, deleted_at)` registry + `record_row_tombstone()` AFTER DELETE trigger on financial tables: `sales`, `stock_history`, `variant_stock_history`, `purchase_records`, `expenses`, `payments`, `store_orders`, `sales_tabs`.
  - `guard_stale_write()` BEFORE INSERT OR UPDATE trigger on the same tables raises `STALE_WRITE` (`ERRCODE P0007`) when: (a) ANY write targets a tombstoned id (delete wins — F17 now DB-enforced across devices, a deleted row can NEVER come back), or (b) `NEW.updated_at < OLD.updated_at` (newest-wins; remote is authoritative).
  - `update_updated_at_column()` now PRESERVES the client timestamp when it is newer than the stored row (previously always stamped `NOW()` making client timestamps useless). Server-side SQL updates still pass (they set `NOW()` explicitly).
  - **Executions do NOT guard** `products`/`customers`/`suppliers` — variation child re-creation reuses ids after variant removal; those tables keep the client-side `updated_at` skip in SyncEngine.
- **SyncEngine handling:** `P0007`/`stale_write` → op is dropped (NOT error-queued — the payload is by definition outdated; retry can never succeed) + local refreshes from cloud via realtime/merge. Cloud = truth.
- **Operational note:** device clocks should be synced; a permanently-behind clock will have its edits rejected (correct — newer edits win).

## RULE F22 — VARIANT-RESTOCK LEDGER (PERMANENT)

- Variant stock edits/restock must ALWAYS flow through `variant_stock_history` (trigger updates `products.variant_data[].stock`) — never through the stripped `variant_data` in product payloads (silently lost before this rule).
- `purchase_records` carries `variant_id`/`variant_label` so stock-in can target ONE variant: `purchaseRecordsService.create` writes ONE `purchase` variant history entry (+qty) and `purchaseRecordsService.delete` reverses it with ONE `adjustment` entry (−qty) — single-reversal (F12) at variant level too.
- All stock-in paths (`commitStockInToInventory`, BatchStockInSystem, ProductDetailHub quick restock) use the SHARED `commitStockInToInventory` helper — parallel stock-in implementations are BANNED (AGENTS.md rule 18).
- ProductDetailHub direct variant-stock field edits log `adjustment` delta entries (previously silently never synced).

## RULE F23 — GUIDE + GUARD-PATTERN REGISTRATION (PERMANENT — every new financial function)

- 📖 **[docs/SYSTEM_FUNCTIONS_GUIDE.md](docs/SYSTEM_FUNCTIONS_GUIDE.md) is the live source of truth** for every DB function/trigger/flow (F21 guard flow, F22 variant ledger, sync/recovery, troubleshooting). Read it before touching SQL/sync/financial logic; UPDATE it in the SAME change as any schema/flow change (stale guide = violation, same spirit as AGENTS.md rule 18).
- EVERY new financial table/function MUST follow the guard pattern checklist (§6 of the guide): 3 triggers per table (`guard_stale_write_*`, `record_row_tombstone_*`, `update_*_updated_at`), append-only ledger triggers for stock/log tables, shared-helper service layer (F12 single-reversal), localDb + SyncEngine (P0007/F17/F18) wiring.
- Register the new function in the guide's §2 registry + add SCHEMA CHANGE LOG entry + run the §7 TEST BATTERY on ALL active clone projects (expect identical results: currently `f21_guards=24`, `tombstones=1`, `functions=7`) — no PASS = no "done".
- NEVER add a financial write path without its guards — the DB layer is the last line of defense against cross-device corruption (F21) and silent stock loss (F22).

## RULE F24 — ESTORE/ONLINE ORDER: NO SALE & NO STOCK UNTIL POS BILL (PERMANENT)

- 🛒 **An online store order (store_orders) MUST NOT create a Sale and MUST NOT change inventory stock (product.stock / variant stock / batches) until it is billed at the POS (CheckoutPage → commitSaleAuthoritative).**
- Flow (BY DESIGN, never deviate):
  1. Customer places order on e-store → only a `store_orders` row is created (status `pending`/`preparing`/`out_for_delivery`/`delivered`). **No sale, no stock delta.**
  2. Admin opens Online Orders → "Load to POS" → `SET_CART` (cart carried to POS only). Still **no sale, no stock delta.**
  3. Cashier bills at POS → `commitSaleAuthoritative` runs → Sale created + stock deducted (and reserved stock released) — THIS is the single point of inventory truth.
- ⛔ Forbidden: any RPC/function/UI that reserves, deducts, or otherwise mutates stock on order placement; any code that creates a Sale/transaction from a store order outside the POS bill path.
- Order status auto-advance (OrderTracker `delivered`) does NOT create a sale or touch stock — status is cosmetic only.
- This rule exists so inventory can NEVER be wrong: stock only ever moves when a real bill is struck at POS. Violation = data-corruption bug.

## RULE F25 — TRUE CLOUD SYNC ON MANUAL REFRESH (PERMANENT)

- **Problem:** Devices lose sync sync when offline or if realtime websocket fails. Clicking standard refresh (`window.location.reload()`) reads stale data from local IndexedDB instantly, dismissing loaders while the actual cloud fetch happens invisibly in the background. Users think the data is still broken/stale.
- **Requirement:** The global Refresh button (in `Header.tsx` or anywhere else) MUST invoke a dedicated `forceSync()` method (from `useApp()`).
- **Implementation:** `forceSync()` clears the local sync cursor (`localDb.syncHistory.clear()`) and triggers `loadData(false, true)` where `forceCloudSync = true`. This parameter ensures that `loading = true` is maintained until the complete background fetch is finished and data is merged locally. Only then is the loader dismissed. 
- **Result:** Manual refresh guarantees a 100% exact parity with the cloud database across all tables immediately upon completion. Any generic `window.location.reload()` for data sync purposes is completely banned.

## RULE F26 — 24-HOUR LOGIN EXPIRY & NETWORK RESILIENCE (PERMANENT)

- **Problem:** Users can be randomly logged out mid-shift if session expiry depends on the wrong clock rules, or if a temporary network drop causes a token refresh to fail (leading to an unwanted `signOut()`). 
- **Requirement:** Session expiry MUST be exactly 24 hours (`pos_session_start`). Unnecessary logouts caused by network issues or temporary server unavailability are STRICTLY BANNED.
- **Implementation:** Check the difference in hours between `Date.now()` and `pos_session_start`. If `>= 24`, explicitly remove the session and sign out. When refreshing the token via Supabase, you MUST check if the error is a network error (`Failed to fetch`, offline, etc). If it is a network error, **do not sign out**. Fallback to the cached `pos_offline_profile` and allow the system to recover gracefully when the network returns.

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
- **🧱 Shared UI Library (MANDATORY — 100% COVERAGE, POS-exempt)**: `src/shared/ui/` — `Button`, `Card`, `Badge`, `SegmentedControl`, `ToggleSwitch`, `SubTabBar`, `Avatar`, `Pagination`, `LoadMoreButton`, `DateRangePicker`, `EmptyState`, `BottomSheet`, `Select`. Import from `../../shared/ui`. **The ENTIRE project (Settings, /store estore, all admin routes, reports, inventory) uses ONLY these modules — POS (`src/components/pos/**`) is the ONLY exemption.** Native `<select>` and hand-rolled buttons are banned outside POS. Estore uses shared wrappers with `!`-prefixed className overrides for its theme-var system. **Every new page/component MUST reuse these exact modules (visual tweaks via `!`-prefixed `className` overrides only — never page-local variants).** Full registry with props + bans: [docs/MODULES.md](docs/MODULES.md) — must stay up to date.
- **Shared Search/List/Drag Modules (MANDATORY on non-POS routes)**: `src/shared/modules/search-and-list/` — `SharedSearchBar`, `SharedProductList`/`SharedProductListItem`, `useDragDropList` + `DragHandle`.
- **Shared Business Logic**: `src/lib/stockInCommit.ts` — `commitStockInToInventory()` is the ONLY stock-in commit path (used by PurchaseOrderSystem + ProductDetailHub Quick Restock). Never write a second implementation.
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
7. **🎨 STRICT UI PROTOCOL (MANDATORY)** — Before writing or editing ANY UI code (React components, Tailwind, CSS), you MUST read **[docs/UI_RULES.md](docs/UI_RULES.md)** and **[docs/MODULES.md](docs/MODULES.md)** first. Never introduce new inline styles, hardcoded colors, or one-off components when a shared module already covers the case — always the SAME shared module everywhere.
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
-- SHIFT SYSTEM REMOVED (2026-08-12) — no shift_id column exists anywhere.
```

**4. Expenses without shift:**
```sql
-- SHIFT SYSTEM REMOVED (2026-08-12) — no shift_id column exists anywhere.
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
- `src/lib/localDb.ts`
- `src/lib/syncEngine.ts`
- `supabase/schema/SUPER_MASTER_SCHEMA.sql`

---

> 🔧 Fix process: bugs ko exact order me fix karo, existing functionality mat todo. Ek response me complete fix do, back-and-forth nahi.

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

### [2026-08-18] apply_payment_movements uuid bug — Sale Delete Abort Fix
**Files:** `supabase/migrations/20260818160000_fix_apply_payment_movements_uuid.sql` (NEW), `SUPER_MASTER_SCHEMA.sql`
**Context (sync round-4):** `apply_payment_movements` used `uuid_generate_v4()` but the function sets `SET search_path TO 'public'` — `uuid_generate_v4` lives in the `uuid-ossp` schema, so it was invisible → every real payment movement returned **404** (masked SQLSTATE 42883 `function uuid_generate_v4() does not exist`). `adjustPaymentBalances` calls this RPC during a sale **delete** and was NOT in a try/catch → threw → `localDb.sales.delete(id)` never ran → cloud sale remained → `cloudPull` re-pulled it back ("delet ni hote wapis aa jate hain"). `apply_stock_movements` already used built-in `gen_random_uuid()` (always visible) and worked. Fix: `uuid_generate_v4()` → `gen_random_uuid()` (verified live: real payload now executes instead of 404ing). This also unblocks all app-originated wallet/payment-movement syncs (sales, refunds, expenses) that were silently 404ing.
**Applied live:** jeanzone 2026-08-18 (CREATE OR REPLACE via Management API). New migration replays the fix on remaining clone projects on next deploy.

### [2026-08-18] sales(created_at) Index — Full-Pull Timeout Fix
**Files:** `supabase/migrations/20260818150000_sales_created_at_index.sql` (NEW, applied live), `SUPER_MASTER_SCHEMA.sql`, `src/lib/services.ts`, `src/lib/cloudPull.ts`, `src/lib/syncEngine.ts`
**Context (sync round-3):**
1. **Full-pull statement timeout (57014):** sales = 45MB (items jsonb ~35KB/row, 1266 rows). Initial cache load (`salesService.fetchRemote`) + cloudPull epoch pull fetched 1000-row pages = ~35MB per single response → PostgREST `statement_timeout` (8s) → `canceling statement due to statement timeout` → "Sync Failed" + local cache never fully loads. Fix: sales pulls now paginate in **200-row pages** (both fetchRemote and cloudPull), plus `CREATE INDEX idx_sales_created_at ON sales (created_at DESC)` for the `order by created_at desc` sort.
2. **`localDb.queueOp is not a function` (TypeError, delete broken):** syncEngine.ts:1014 called `localDb.queueOp(...)` on the Dexie instance — `queueOp` is a standalone export, so the canceled-order prune (24h) threw and the delete never queued. Now imports + calls `queueOp(...)` directly.
**Applied live:** jeanzone 2026-08-18 (index created via Management API). Push to remaining clone projects on next deploy.

### [2026-08-18] Soft-Delete + Fail-Closed Commit + Grants Narrowing + RLS Hardening + Oversell Lock Fix
**Files:** `supabase/migrations/20260818140000_soft_delete_and_hardening.sql` (NEW, applied live), `SUPER_MASTER_SCHEMA.sql`, `src/lib/cloudPull.ts`, `src/lib/syncEngine.ts`, `src/context/SupabaseAppContext.tsx`, `src/components/layout/Header.tsx`
**Context (MASTER round 2):**
1. **§0.6/§8 soft delete:** `delete_sale_atomic` NEVER destroys the historical sale row — now `UPDATE sales SET status='deleted', deleted_at=now()` + `row_tombstones` upsert (`ON CONFLICT (table_name, ref_id) DO UPDATE`). Double-delete is idempotent (`already_deleted`). `syncEngine` sales delete ops now call this RPC (not REST DELETE); `cloudPull` filters `.is('deleted_at', null)` so soft-deleted sales never re-surface; force-pull applies tombstones.
2. **§2.1.4 fail-closed commit_sale:** missing `users` row (NULL role) is REJECTED (`42501`), never silently allowed. Roles: admin|manager|cashier|salesman.
3. **§12 oversell guard — REAL ROOT CAUSE FIX (live-tested):** inline `SELECT ... FOR UPDATE` inside an INVOKER plpgsql function on an RLS table **silently returns 0 rows for non-owner roles** (plain SELECT works; any locking clause returns nothing — reproduced at core SQL level for cashier AND admin). The guard therefore NEVER fired. Fix: new `lock_product_stock(pid)` SECURITY DEFINER helper takes the row lock in the CALLER's transaction (owner context). Race test (2 concurrent commit_sale on last unit, stock=1): exactly ONE succeeds, other gets `OVERSELL (P0003)`, stock ends 0, exactly 1 sale row. Sequential oversell also verified. EXECUTE restricted to `authenticated` (revoked from anon/public).
4. **§2.1.4 anon grants narrowed:** `REVOKE ALL ON ALL TABLES` → `GRANT SELECT` on all + `GRANT INSERT ON customers, store_orders` (public estore) + sequences; `REVOKE ALL ON ALL FUNCTIONS` + re-grant EXECUTE. `row_tombstones` anon policy → SELECT only.
5. **§2.1.4 RLS hardening:** per-command policies on products (SELECT public / write admin+manager), sales (SELECT/INSERT/UPDATE authenticated, **NO DELETE policy** — delete only via guarded RPC), customers (SELECT public, INSERT public, write admin+manager), app_settings (old FOR-public write policies REPLACED — write admin+manager), expenses/suppliers/supplier_transactions (SELECT authenticated, write admin+manager). Derived-value triggers → SECURITY DEFINER: `trigger_update_product_stock`, `trigger_update_variant_stock`, `update_customer_stats`, `generate_invoice_number`, `get_next_invoice_number` (else cashier checkout breaks under RLS).
6. **Force-sync UI fixes:** Header force-sync modal never closed (sonner.loading = MODAL, success = toast — now `sonner.close()` after sync), 45s timeout via `Promise.race`, offline guard (no fake "synced" toast — warning instead); `forceSync` rework: clears syncHistory → `waitForPullIdle(30000)` → `resetLastPullTime()` → `pullCloudChanges(true)` → `handleCloudPullChanged` → finally loading=false (removed slow legacy `loadData(false,true)`).
7. **Tombstone pull bug fix:** `row_tombstones` has NO `created_at` column — pull previously filtered `gte('created_at')` so tombstones NEVER applied. Now uses `deleted_at`.
**Live verification (jeanzone, 2026-08-18):** live RPC defs verified (has_lock, fail_closed, soft_delete); §2.1.5 rejected-API matrix PASS (cashier PATCH products/customers/expenses/app_settings = 0 rows blocked; cashier sales DELETE = 0 rows; cashier delete_sale_atomic = 403; cashier users role change = 403; anon delete_sale_atomic = 401; anon sales INSERT = 401; anon customers INSERT = 201 allowed; cashier suppliers INSERT = 403; over-refund = 403 `FORBIDDEN: refund amount exceeds sale total`; refund of deleted sale = `STALE_WRITE` P0007); idempotency PASS (same idempotency_key → `already_committed`; double delete → `already_deleted`); legit partial refund restores stock via trigger; `get_next_invoice_number` as cashier = 200 (SECURITY DEFINER under RLS). All test data/users cleaned up.
**Applied live:** jeanzone 2026-08-18. Push to remaining clone projects on next deploy.

### [2026-08-18] Cross-Device Pull Engine + Login Expiry 24h + Wallet Backfill + Users RLS
**Files:** `src/lib/cloudPull.ts` (NEW), `src/context/SupabaseAppContext.tsx`, `src/context/AuthContext.tsx`, `src/lib/services.ts`, `supabase/migrations/20260818120000_cloud_pull_and_hardening.sql`, `SUPER_MASTER_SCHEMA.sql`
**Context:** (1) System was PUSH-ONLY — no cloud→local pull existed, so devices never showed each other's changes even after refresh. New `cloudPull.ts` engine pulls deltas every 15s + on online/focus + Supabase Realtime (best-effort) + tombstone-driven deletes + user-block detection; AppContext refreshes React state on change; Header Force Sync now does a full cursor-reset pull. (2) GEMINI rule "session expiry MUST be exactly 24 hours" was violated by code (7-day/5AM) — now exactly 24h from `pos_session_start`, refreshed on every login. (3) Wallet ledger was empty (only 15 rows vs 1265 completed sales) — `backfill_payment_movements()` RPC reconstructed 1280 ledger rows from `sales.split_payments` + expenses, balances recomputed from ledger (I2 parity = 0 mismatches). (4) Expense create/update/delete now write `payment_movements` (was missing). (5) Users RLS + role-escalation guard trigger (anon role rewrite blocked). (6) `variant_stock_history` idempotency index. (7) `process_return` idempotency fix (SET cumulative, was += double-post). (8) `apply_stock_movements`/`apply_payment_movements` role guards. (9) anon grants narrowed to SELECT-only (writes need JWT). (10) Realtime REPLICA IDENTITY FULL on all core tables.
**Live verification (jeanzone):** I1=0, I2=0, I6=0, invariant_violations=0, stock_mismatches=0, duplicate movements=0, post-repair new data=0 mismatches, backfill inserted=1280. I4 raw mismatches are ALL historical artifacts (deleted products / empty-item bill-edit sales) — 0 real mismatches on existing tracked products. I5 8 rows are negative-total bill-edit artifacts (refunded_amount=0, no ledger impact).
**Applied live:** jeanzone 2026-08-18 (migration + backfill). Push to remaining clone projects on next deploy.

### [2026-08-18] RESTORE ANON-KEY DATA PATH (reverses 20260818140000 / 20260818100000 / 20260818010000 hardening)
**Files:** `supabase/migrations/20260819000000_restore_anon_compat.sql` (NEW, applied live), `SUPER_MASTER_SCHEMA.sql`
**Context — WHY this reversal was necessary:** The 2026-08-18 hardening (commit_sale_role_check + soft_delete_and_hardening + rpc_role_guards) required `auth.uid()` (an authenticated Supabase session) for EVERY sale commit, stock write, delete and refund, and narrowed RLS to `authenticated`-only. BUT this POS ships the **public anon key** in the browser bundle and the app frequently operates WITHOUT a Supabase-auth session — `AuthContext.signIn` tries `supabase.auth.signInWithPassword` but the app's `users`-table password rarely matches the separate `supabase auth.users` password, so it falls back to the **offline-login path** (no Supabase session). Result: `auth.uid()` is effectively always NULL for the data client. Impact (verified in live DB): cloud sales collapsed from ~20/day (Aug 11-15) to ~1-8/day (Aug 17-18); `products`/`sales` RLS blocked the anon client so the laptop's `fetchRemote` returned 0 sales; stock stopped decreasing (no cloud `stock_history`); deletes stopped syncing.
**Fix:** Removed the `auth.uid()` / role `FORBIDDEN` guards from `commit_sale`, `delete_sale_atomic`, `refund_sale_atomic`, `apply_payment_movements` (kept idempotency, soft-delete+tombstone, over-refund cap). Re-added permissive `anon, authenticated` RLS policies + table/sequence/function grants on all synced tables so the browser anon-key client can read AND write. This restores the pre-2026-08-18 working behaviour that the app's actual auth model requires.
**Live verification (genmpxcnmdcfwwymjibd, 2026-08-18):** `commit_sale` called as **anon** returned `{"success": true}` (no FORBIDDEN); product stock decreased 999985→999980 on a real movement; `delete_sale_atomic` as anon returned `{"success": true}` and reversed stock 999980→999985 + set `status='deleted'`; anon `SELECT` on `sales`/`products` now returns rows. NOTE: MASTER §2.1.4 role enforcement is intentionally dropped here because it is unenforceable in this anon-key single-tenant architecture — if true per-user auth is later required, the correct fix is to make `AuthContext.signIn` establish a real Supabase session (sync `users`-table passwords to `auth.users`), NOT to gate RPCs on `auth.uid()`.
**Applied live:** genmpxcnmdcfwwymjibd 2026-08-18. Push to remaining clone projects on next deploy.
**DATA CORRUPTION FOUND:** product `Kids Shorts Summer` shows stock = **-111** (negative) — the earlier broken sync (retry storms + the `pe.queueOp is not a function` bug) over-applied stock movements. Run `audit_stock_integrity_history()` + a stock reconciliation after this fix lands.

### [2026-08-15] Add Missing store_orders updated_at Trigger
**Files:** `supabase/migrations/20260815152500_add_store_orders_updated_at_trigger.sql`, `SUPER_MASTER_SCHEMA.sql`
**Context:** The `update_updated_at_column` trigger was missing for `store_orders` in the schema, which is required for the F21 stale-write guard pattern. Added the trigger to complete the guard pattern.

### [2026-08-16] Atomic Delete/Refund RPCs + SyncEngine Self-Heal + Audit Accuracy Fixes
**Files:**
- `supabase/migrations/20260816010000_atomic_delete_refund_rpc.sql` (+ appended to `SUPER_MASTER_SCHEMA.sql`) — new `delete_sale_atomic(p_sale_id, p_history)` and `refund_sale_atomic(p_sale_id, p_history, p_status, p_refunded_amount)` RPCs. Stock reversal + sale mutation in ONE tx (idempotent via ON CONFLICT DO NOTHING + EXISTS guards). Deployed jeanzone + minimahal.
- `supabase/migrations/20260816020000_role_narrowing.sql` (+ `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`) — role CHECK narrowed to `(cashier, salesman)`; `handle_new_user` first-user no longer auto-admin; legacy rows migrated. Deployed jeanzone + minimahal. TS `User.role` is now `'cashier' | 'salesman'`.
- `src/lib/services.ts` — `deleteSaleAtomic`/`refundSaleAtomic` wrappers; `salesService.delete` now atomic (adds `partially_refunded` to stock-restore guard → fixes leak); `returnSale` atomic + re-entrancy mutex (`activeReturns`) + `status==='refunded'` no-op; `reconcileAllStock` now audits+fixes BOTH scalar `stock_history` AND `variant_stock_history`/variant_data (F22); `productsService.update` strips stock (scalar+variant) so generic updates can't desync the ledger.
- `src/lib/syncEngine.ts` — invoice-collision recovery fixed (`data` is scalar TEXT, not `data.invoiceNumber` → previously silently dropped colliding sales); `reconcileStuckOps()` self-heal re-queues exhausted ops every 15 min; boot `reconcileAllStock(false)` (report-only, no silent offline-stock erasure).
- `src/lib/localDb.ts` — `isPendingChange()` helper (mirrors `isPendingDelete`).
- `src/context/SupabaseAppContext.tsx` — products realtime UPDATE no longer clobbers a locally-pending edit.
- `src/components/reports/ReportsManager.tsx` — report cache TTL 30s→10s + window-focus/visibility force-refresh.
- `src/components/users/UserModal.tsx` — removed unused `createClient` import.
**Context:** Deep audit confirmed 4 real gaps (CRITICAL #1 partial-refund delete leak, CRITICAL #2 dead invoice-collision recovery, HIGH #3 variant ledger ignored by reconcile, HIGH #4 returnSale re-entrancy) plus boot autoFix data-loss + role-DB gap + products.update stock footgun. All fixed. Self-heal guarantees no op is ever permanently stuck.
**Remaining (deferred, non-corruption):** #6 local↔cloud reconcile compare; #8 `device_id` column; #10 schema dedup; #12 online-order reservation; #14 `product_batches` removal; #7 `adminSupabase` service_role client needs server-side refactor (route blocked, currently null-guarded).

### [2026-08-12] Full-Project Audit Fixes — F12-F20 + Universal Branding
**Files:** `supabase/migrations/20260812215000_estore_cancel_double_release_guard.sql`, `SUPER_MASTER_SCHEMA.sql`, `src/lib/services.ts`, `src/lib/syncEngine.ts`, `src/lib/localDb.ts`, `src/context/SupabaseAppContext.tsx`, `src/components/reports/ReportsManager.tsx`, `src/components/dashboard/DashboardManager.tsx`, `src/components/transactions/TransactionsManager.tsx`, `src/components/transactions/RefundSaleModal.tsx`, `src/components/inventory/PurchaseHistory.tsx`, `src/components/pos/POSTerminal.tsx`, `AGENTS.md`, `GEMINI.md`, `docs/setup.md`
**Context:** 3 parallel audits (stock ledger integrity, sync engine, money math) found 15 issues — all fixed. Universal rules F12-F20 written into AGENTS.md + GEMINI.md.
**Fixes:**
1. **C1 (CRITICAL):** PurchaseHistory delete double-reversal (−2×Q on cloud) — handler no longer reverses; `purchaseRecordsService.delete` now reverses ALL record types (incl. Adjustment, signed quantity) with ONE `adjustment_out` entry.
2. **H1/B1:** `partially_refunded` double-count in ReportsManager revenue/wallets — merge by sale id (sales copy wins).
3. **B2:** Credit Collected + collections exclude refund payouts (`direction:'out'`).
4. **A1:** `getReportExpenses` paginated via `fetchAllPages` (was capped at 1000).
5. **H3:** Drafts = `status:'pending'` — create/delete skip all stock/customer effects; `getReportSales` filters `.neq('status','pending')`.
6. **H4:** ADD_SALE reducer skips estore fulfillment sales (sourceOrderId).
7. **H5/H6:** queueOp merge — delete survives update/upsert; merge resets `retries:0`.
8. **H7:** payments delta fetch failure = identity no-op (no local ledger wipe).
9. **B3:** RefundSaleModal 2dp rounding.
10. **B5/B6:** Dashboard + Transactions wallet totals match Reports definition (credit excluded, refunds per method).
11. **A2:** state.sales 1000-cap removed (never truncate financial data).
12. **A3:** cloud sales search paginated; `fetchAllPages` exported.
13. **F20:** constraint errors mark ops `error` (never delete); sync timeout no longer releases `_isSyncing` mid-batch.
14. **F18:** sales UPDATE realtime skips pending-delete rows; realtime `stock_history` rows mapped.
15. **DB:** estore cancel trigger releases stock only when `fulfilled_sale_id IS NULL` (migration 20260812215000) — deployed to all 4 projects.
16. **Universal branding:** all vendor branding removed from code (tenant name from settings, neutral `POS` fallback). Persistence keys preserved (`ZaynahsPosDB_`, `Zaynahs_Local_Backups_DB`, `zaynahs-pos-auth`, logo asset).

### [2026-08-12] Permanent Fixes — F21 Stale-Write Guards + F22 Variant-Restock Ledger
**Files:** `supabase/migrations/20260812180000_stale_write_guards_variant_restock.sql`, `SUPER_MASTER_SCHEMA.sql`, `src/lib/syncEngine.ts`, `src/lib/services.ts`, `src/lib/stockInCommit.ts`, `src/components/inventory/BatchStockInSystem.tsx`, `src/components/inventory/ProductDetailHub.tsx`, `src/types/index.ts`, `AGENTS.md`, `GEMINI.md`, `docs/setup.md`
**Context:** The last two known limitations were made PERMANENT solutions: (1) cross-device stale writes could resurrect deleted ledger rows (last-write-wins), (2) variant stock never updated on restock.
**Fixes:**
1. **F21 (DB, server-enforced):** `row_tombstones` registry + `record_row_tombstone()` AFTER DELETE + `guard_stale_write()` BEFORE INSERT/UPDATE raising `STALE_WRITE` (P0007) on `sales`, `stock_history`, `variant_stock_history`, `purchase_records`, `expenses`, `payments`, `store_orders`, `sales_tabs`. Deleted financial rows can NEVER resurrect; newest-wins replaces last-write-wins. `update_updated_at_column()` now preserves client timestamps when newer.
2. **F21 (SyncEngine):** P0007/stale_write error → op dropped (by-definition-outdated payload; retry impossible) + local refreshes via realtime/merge (cloud = truth). NOT applied to products/customers/suppliers (variation child id reuse; they keep client-side skip).
3. **F22:** `purchase_records.variant_id`/`variant_label` columns; `purchaseRecordsService.create` writes ONE `purchase` variant_stock_history entry (+qty) + local variantData update via shared `applyVariantStockMovement()`; `delete` reverses with ONE `adjustment` entry (−qty). `commitStockInToInventory` (shared path) + BatchStockInSystem (refactored onto the shared helper, variant selector column added) + ProductDetailHub quick-restock all support variant-targeted restock.
4. **F22:** ProductDetailHub direct variant-stock field edits log `adjustment` delta entries (previously silently stripped from product payloads and LOST).
5. **Schema docs:** master schema + setup.md updated; deploy = full master schema push via Management API to all 4 projects (also covers NEW clones — schema is idempotent, a new clone auto-installs all guards by pushing `SUPER_MASTER_SCHEMA.sql`).

### [2026-08-12] System Functions Guide + F23 Registration Rule
**Files:** `docs/SYSTEM_FUNCTIONS_GUIDE.md` (new), `GEMINI.md` (RULE F23), `AGENTS.md` (reference + F23)
**Context:** User asked for a permanent detailed guide so future agents can understand the full system flow (every DB function, trigger, financial flow) without re-researching, plus a mandatory rule that every new function follows the same guard pattern and registers itself in the guide.
**Added:**
1. **Guide:** `docs/SYSTEM_FUNCTIONS_GUIDE.md` — layer map (app vs Supabase), full §2 registry of ALL 9 DB functions/triggers (verified live 24 guards/7 functions/2 stock triggers × 4 projects), F21 stale-write flow diagram, F22 variant-restock flow diagram, sync/recovery flow, §6 MANDATORY checklist for adding new financial tables/functions (3 triggers + ledger + shared helper + localDb/sync + register + test), §7 ready-to-run TEST BATTERY (A schema inventory, B live guard battery, C variant ledger live, D residue check), §8 troubleshooting cheatsheet.
2. **RULE F23 (GEMINI.md):** guide = live source of truth; every new financial table/function MUST follow the guard pattern; register in guide §2 + SCHEMA CHANGE LOG + run battery on ALL 4 projects (expected: `f21_guards=24`, `tombstones=1`, `functions=7`); NEVER add a financial write path without guards.
3. **AGENTS.md:** F23 listed in AUDIT-GRADE RULES + guide added to Reference Docs table.

### [2026-08-12] TESTS_GUIDE full-flow battery — Estore + Schema Parity fixes
**Files:** `docs/TESTS_GUIDE.md` (new), `supabase/migrations/20260812235500_fix_estore_place_order_bugs.sql`, `supabase/migrations/20260813000000_fix_products_variant_history_schema_parity.sql`, `SUPER_MASTER_SCHEMA.sql`, `docs/SYSTEM_FUNCTIONS_GUIDE.md`, `docs/setup.md`
**Context:** User asked for a complete test guide + full system flow test (products all types, billing, estore, orders→POS, reports) — and to delete all test records after. Battery found 3 real DB issues, all fixed + verified on all 4 projects, then **zero residue cleanup**.
**Fixes (all deployed to 4 projects via Management API, verified):**
1. **ESTORE ORDERING TOTALLY BROKEN (all projects):** `place_estore_order` wrote to non-existent `address`/`table_number`/`fulfillment_mode` columns + cast UUID `reference_id`→`::text` → every online order + every cancel failed. Rewrote: `delivery_address` (jo app bhejta hai), UUID refs, **F22 variant-aware reservation/release** (variant items reserve via `variant_stock_history`). Retest: reserve −2, variant reserve −2, cancel +2, fulfil→sale — 4/4 PASS.
2. **MINIMAHAL products schema divergence:** `product_type`, `is_service`, `require_serial`, `is_weight_based`, `price_per_unit`, `unit`, `parent_id` columns missing (master schema post-launch ALTER block omitted them; v16 CREATE-only). Added idempotently → variable products now save there.
3. **PIZZAMILANO variant_stock_history CHECK divergence:** type list lacked `'purchase'` (+ signed types) → variant stock-in crashed there. Normalized to 7-type set on all projects.
**After fixes:** full system-flow battery **11/11 PASS identical on all 4 projects** (products simple+variable, stock_in +10, variant stock_in +3, sale deduct, draft no-deduct, stale edit P0007, delete restore once, tombstone resurrect block, estore reserve/variant/cancel, fulfil-link). Cleanup: **residue 0/0/0/0** (products/sales/orders/history/tombstones all test rows deleted).

### [2026-08-12] docs/setup.md — MAJOR RULES section (7 non-negotiable rules)
**Files:** `docs/setup.md` (Core Principles + new ⚠️ MAJOR RULES section + TOC update)
**Context:** User requested the universal operating rules documented in setup.md so every session/agent follows them without ambiguity.
**Added:** Table of 7 non-negotiable rules — (1) Code = UNIVERSAL (1 codebase, sab 4 repos, no brand hardcode), (2) Env/Credentials always from `env_backups/` (har shop ka apna file — kabhi guess/mix nahi), (3) All fixes applied to ALL projects + deploy verify mandatory (no verify = no "done"), (4) Code 1 — credentials ALAG-ALAG (har shop apna env/CF token), (5) Master Schema = SAME parity on all 4 projects (SUPER_MASTER_SCHEMA.sql single source), (6) Systems IDENTICAL on all projects (test battery results identical: `f21_guards=24`/`tombstones=1`/`functions=7`, divergence = fix), (7) Docs current (SYSTEM_FUNCTIONS_GUIDE/MODULES/UI_RULES/GEMINI/setup.md update in same change).

### [2026-08-12] Financial Integrity Sweep — Trigger Model Completion + Reconcile Restore
**Files:** `supabase/migrations/20260812142314_get_next_invoice_number_rpc.sql`, `SUPER_MASTER_SCHEMA.sql`, `src/lib/services.ts`, `src/lib/syncEngine.ts`, `src/lib/localDb.ts`, `src/context/SupabaseAppContext.tsx`, `src/components/inventory/InventoryManager.tsx`, `src/components/inventory/ProductDetailHub.tsx`, `src/components/inventory/PurchaseHistory.tsx`, `GEMINI.md`
**Context:** Cloud triggers `on_stock_history_insert` + `on_variant_stock_history_insert` were added earlier (08-12) to make stock single-source via the append-only stock_history ledger. This sweep fixed every remaining path that still sent ABSOLUTE stock in `products` payloads (double-count with the trigger), restored the F11 reconcile tool, and hardened sync data-loss paths.
**Fixes:**
1. **Non-atomic product payloads — stock stripped everywhere** (cloud stock is now ONLY via history trigger):
   - `salesService.delete` main + addon restores (`services.ts`), refund addon restore, `productsService.adjustStock`, `purchaseRecordsService.create` cost payload, `productsService.create` (only when an `initial` history entry exists — non-tracked 999999 stock keeps absolute value), `PurchaseHistory` delete reversal.
   - Kept absolute stock ONLY for non-tracked products (no history entry → no trigger → absolute value required).
2. **Variant stock restore on delete/refund:** `salesService.delete` + `returnSale` now write `variant_stock_history` 'return' entries + restore local `variant_data` (previously variant levels stayed permanently low after delete/refund).
3. **Direct stock edit audit:** `ProductDetailHub.handleSave` now logs `adjustment` history when the stock field is edited directly (was silent before).
4. **Reconcile tool restored (RULE F11):** `reconcileAllStock(autoFix?)` in `services.ts` — replays cloud `stock_history` ledger (Σ change_qty per product), compares with `products.stock`, reports mismatches, auto-fix writes one `adjustment` history entry per mismatch (trigger aligns stock). Purple "Reconcile" button with Shield icon added to InventoryManager toolbar.
5. **Sync data-loss hardening:**
   - `pruneStaleOps` now ONLY prunes errored ops (never pending — unsynced bills are financial records).
   - `queueOp` cap no longer drops pending ops — prunes errored ones instead, or warns.
   - `pruneExpiredCancelledOrders` REMOTE DELETE REMOVED — cancelled orders are permanent financial records; cloud audit trail preserved (local cache still cleaned).
6. **Invoice collision RPC added:** `get_next_invoice_number()` now exists (was missing → collision retries always failed). Deployed to all 4 projects.
7. **Report truncation fixed:** `getReportSales` + `getReportRefunds` + `salesService.searchSales` + `salesService.fetchRemote` + `storeOrdersService.fetchRemote` now paginate via `fetchAllPages` (no more 200/5000 caps — big-shop totals accurate).
8. **Fixed pre-existing build error:** duplicate `costUpdate` declaration in `purchaseRecordsService.create`.
9. **AppContext realtime sale reducer** no longer floors stock at 0 (matches ledger negative values).

### [2026-07-31] Fix: Add updated_at to 5 ledger/history tables (Delta Sync 400s)
**Files:** `supabase/migrations/20260731210000_add_updated_at_ledger_history_tables.sql`, `SUPER_MASTER_SCHEMA.sql`, `docs/setup.md`, `GEMINI.md`
**Issue:** Delta sync queries `updated_at=gte.X` on `supplier_transactions`, `payments`, `stock_history`, `variant_stock_history`, `product_addons` — but these tables only had `created_at`. Supabase REST returned **400 (Bad Request)**; code fell back to full-table fetches every sync ("[stockHistory] Delta sync failed, fetching all").
**Fixes:**
1. **Schema Migration:** Added `updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL` to all 5 tables (ALTER TABLE ADD COLUMN IF NOT EXISTS) + `update_*_updated_at` triggers via existing `update_updated_at_column()` function + backfill `updated_at = created_at` for existing rows.
2. **Master Schema:** Added `updated_at` to both CREATE TABLE blocks (incl. duplicate block copies) AND post-launch ALTER TABLE + trigger block in `SUPER_MASTER_SCHEMA.sql`.
3. **Docs:** `docs/setup.md` table rows 15–17 updated.
4. **No code change needed** — services.ts already has the correct `updated_at` delta query; the fallback catch will simply never trigger now.

### [2026-07-24] Fix: App Settings Singleton Reset Bug (Multiple DB Rows)
**Files:** `services.ts`, `GEMINI.md`
**Issue:** `app_settings` is a singleton table and must only have one row (`id = 00000000-0000-4000-8000-000000000001`). However, Supabase contained 7 extra garbage rows with random UUIDs. `settingsService.fetchRemote()` was doing `select('*')` without an order and picking `data[0]`. This caused it to randomly pick a garbage row containing default settings (Dark mode, 4 columns), which would overwrite local state and cause settings to "reset" across all devices on page refresh.
**Fixes:**
1. **Database Cleanup:** Executed a Supabase API DELETE command to remove all rows where `id != 00000000-0000-4000-8000-000000000001`.
2. **Code Hardening:** Modified `settingsService.fetchRemote()` in `src/lib/services.ts` to strictly query `.eq('id', SETTINGS_ID)`. This ensures that even if garbage rows are accidentally created in the future, the app will ALWAYS fetch the correct singleton row.

### [2026-07-23] Full-System Re-Audit v2: Ledger Separation, Manual Override, Soft-Delete, Suppliers Report
**Files:** `supabase/migrations/20260723120000_ledger_separation_manual_override.sql`, `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `BatchStockInSystem.tsx`, `PurchaseOrderSystem.tsx`, `SupplierLedger.tsx`, `CustomerDetailModal.tsx`, `ExpenseModal.tsx`, `SuppliersReport.tsx` (NEW), `ReportsManager.tsx`, `GEMINI.md`
**Changes:**
1. **Schema Migration:** Adds `source_type TEXT`, `is_manual_override BOOLEAN`, `override_by TEXT` to `supplier_transactions`. Adds `is_manual_override`, `override_by` to `payments` and `expenses`. Adds `deleted_at TIMESTAMPTZ` to `sales`. Backfills existing entries.
2. **Master Schema:** Added to both CREATE TABLE and post-launch ALTER TABLE blocks in `SUPER_MASTER_SCHEMA.sql`.
3. **Types:** Added `sourceType`, `isManualOverride`, `overrideBy` to `SupplierTransaction`, `Payment`, `Expense` interfaces.
4. **Services:** `toRemoteSupplierTransaction` maps 3 new fields; `recordBill` accepts `sourceType`; `recordPayment` accepts override flags; `getLedger` exposes `sourceType`; `bulkUpdate` logs per-product price-change history via stock_history; `salesService.delete` converted from hard-delete to soft-delete (status='deleted').
5. **BatchStockInSystem + PurchaseOrderSystem:** Added "Record as Supplier Bill" toggle (default ON), passes `sourceType: 'auto_purchase'`.
6. **SupplierLedger:** Color-coded badges (AUTO-PURCHASE blue, MANUAL BILL red, PAYMENT green, OPENING violet), manual override toggles in payment + bill modals.
7. **CustomerDetailModal + ExpenseModal:** Manual override toggle added to payment/expense forms.
8. **SuppliersReport (NEW):** Full supplier report tab with summary cards, sortable table, expandable per-supplier ledger, source badges, CSV export, mobile responsive.
9. **ReportsManager:** Added 'suppliers' tab with Truck icon (amber color).

### [2026-07-17] Add Custom Badge System to Bundles (Color, Text, Icon, Enable/Disable)
**Files:** `supabase/migrations/20260717170000_add_badge_columns.sql`, `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `BundleManager.tsx`, `HighlightBadge.tsx`, `StoreFront.tsx`, `GEMINI.md`
**Changes:**
1. **Schema Migration:** Adds `badge_enabled BOOLEAN`, `badge_text TEXT`, `badge_icon TEXT`, `badge_bg_color TEXT`, `badge_text_color TEXT` to `bundles` table. Backfills Crown Crust deals with enabled=true, text='CROWN', icon='crown', bg='#1A1A1A', text='#D4AF37'.
2. **Master Schema:** Added to both `CREATE TABLE IF NOT EXISTS bundles` and post-launch `ALTER TABLE` blocks.
3. **Types:** Added `badgeEnabled`, `badgeText`, `badgeIcon`, `badgeBgColor`, `badgeTextColor` to `Bundle` interface.
4. **Services:** `mapBundle` maps badge fields; `create`/`update` persist badge fields to Supabase + localDb.
5. **BundleManager.tsx:** Added "Badge" section in edit form after Pricing Mode with enable toggle, text input, 8-icon picker, 6 bg-color swatches + color picker, 4 text-color swatches + color picker, and live preview.
6. **HighlightBadge.tsx:** Rewritten to support new dynamic badge system (badgeEnabled, badgeText, badgeIcon, badgeBgColor, badgeTextColor) while keeping legacy `highlightTag` backward compat.
7. **StoreFront.tsx:** Bundle cards now render badge via new dynamic system when `badgeEnabled=true`, falling back to legacy `highlightTag`.

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

### [2026-07-17] Add override_price to Bundles for Fixed-Price Slot Deals
**Files:** `supabase/migrations/20260717120000_add_override_price.sql`, `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `BundleManager.tsx`, `StoreFront.tsx`, `ProductGrid.tsx`, `GEMINI.md`
**Changes:**
1. **Schema Migration:** Adds `override_price NUMERIC(10,2)` to `bundles` table. Backfills Sunday Offer Small/Medium/Large with 550/750/1050.
2. **Master Schema:** Added to both CREATE TABLE and ALTER TABLE blocks.
3. **Types:** Added `overridePrice?: number` to `Bundle` interface.
4. **Services:** Wired `override_price` in mapBundle, create, and update.
5. **BundleManager UI:** Added "Pricing Mode" toggle — "Discount from Base" (existing %/fixed) or "Set Fixed Price" (direct override_price input) — works generically for any business type.
6. **StoreFront.tsx + ProductGrid.tsx:** If `overridePrice` is set, uses it directly as the final price (no base/discount math). If not, falls back to existing `bundleTotal - discount` logic.
7. **StoreFront deal card:** overridePrice deals show exact price (no "From" prefix), hide discount badge.

### [2026-07-17] Add deal_category Column to Bundles + Category Grouping UI
**Files:** `supabase/migrations/20260717110000_add_deal_category.sql`, `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `BundleManager.tsx`, `ProductGrid.tsx`, `GEMINI.md`
**Changes:**
1. **Schema Migration:** `supabase/migrations/20260717110000_add_deal_category.sql` adds `deal_category TEXT NOT NULL DEFAULT 'pizza'` to `bundles` table with CHECK constraint in `('pizza','burger','beverage','single_item')`. Backfills existing Crown Crust Deal + 3 Sunday Offers to `'pizza'`.
2. **Master Schema:** Added `deal_category` to both `CREATE TABLE IF NOT EXISTS bundles` and post-launch `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block.
3. **Types:** Added `dealCategory?: 'pizza' | 'burger' | 'beverage' | 'single_item'` to `Bundle` interface in `types/index.ts`.
4. **Services:** `mapBundle` maps `row.deal_category → dealCategory`; `create` sends `deal_category`; `update` maps `data.dealCategory → updates.deal_category` and `localUpdates.dealCategory`.
5. **BundleManager.tsx:** Added `activeCategory` filter state. Bundle list now shows category filter tab bar (All/Pizza/Burger/Beverage/Single Item with counts). Bundles grouped under category section headers with colored accent bar, icon, and count badge.
6. **ProductGrid.tsx (POS):** `groupedBundles` now sorted by `dealCategory` order (pizza → burger → beverage → single_item) instead of insertion order.

### [2026-07-17] Delete 3 Pizza Deals + Fix Descriptions
**Files:** `supabase/migrations/20260717100000_delete_3pizza_deals_fix_desc.sql`
**Changes:**
1. **Deleted 3 Pizza Deals (Small/Medium/Large):** Removed all bundle_slot_toppings, bundle_slot_options, bundle_slots, bundle_items, and bundles for all 3 deals (not on Pizza Milano menu).
2. **Fixed Description:** Bar.B.Q Chicken Pizza: "Chicken Bar.B.Q" → "Chicken BBQ" (per menu).

### [2026-07-17] Reconcile DB vs Real Pizza Milano Menu
**Files:** `supabase/migrations/20260717080000_reconcile_pizza_milano_menu.sql`
**Changes:**
1. **Deleted Burger Products:** Removed Beef Burger + Chicken Burger (not on Pizza Milano menu).
2. **Deleted Burger Meal Deal:** Removed entire bundle + slots + slot options (no burger products exist).
3. **Fixed Naming:** "Chicken Malai Boti pizza" → "Chicken Malai Boti Pizza" (capitalization).
4. **Converted Crown Crust Deal:** Fixed Bundle → Slot-Based (`is_combo=true`) with 1 slot "Choose Your Premium Pizza (Pick 1)" offering Crown Crust Pizza and Seekh Kabab Pizza as options. Discount set to 0 (user pays product variant price).
5. **Verified All Products:** All 21 pizza names, descriptions, variant prices (6"/10"/13"), toppings pricing (Cheese 70/100/150, Chicken 50/80/100, Veggie 30/50/70), and beverages match the Pizza Milano menu exactly.

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
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `localDb.ts`, `services.ts`, `barcode.ts`, `BarcodePreview.tsx`, `ProductModal.tsx`, `ProductDetailHub.tsx`, `InventoryManager.tsx`, `useHardwareScanner.ts`, `POSTerminal.tsx`, `ProductGrid.tsx`, `BarcodeGenerator.tsx`, `ReceiptPrint.tsx`, `DatabaseTools.tsx`, `Settings.tsx`
**Changes:**
1.  **Database & Schema Parity (`SUPER_MASTER_SCHEMA.sql`, `localDb.ts`)**:
    *   Added `barcode_value TEXT` column and `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_value` across SQL schema and Dexie IndexedDB. Bumped Dexie IndexedDB version to v12 to seamlessly register `barcodeValue`.
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
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `services.ts`, `ProductModal.tsx`, `POSTerminal.tsx`, `Cart.tsx`, `ReceiptPrint.tsx`
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
**Files Updated:** `SUPER_MASTER_SCHEMA.sql`, `localDb.ts`, `types/index.ts`, `services.ts`
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

### [2026-07-17] Full Deal System Audit — Burger Meal Deal Fix, Burger Products Created, Duplicate Deleted
**Files:** `supabase/migrations/20260717070000_fix_burger_deal_and_deals.sql`, `AGENTS.md`
**Changes:**
1. **Burger Products Created:** Inserted `Beef Burger` (SKU: BEEF-BURGER, Rs450) and `Chicken Burger` (SKU: CHICKEN-BURGER, Rs450) in new "Burgers" category with uploaded images.
2. **Burger Meal Deal Slot Fix:** Swapped mismatched categories — Main Course slot now shows burgers (was beverages), Beverage slot now shows drinks (was pizzas). Fixed for both original and duplicate records.
3. **Duplicate Removed:** Deleted "Burger Meal Deal (2)" record + its slots + slot options.
4. **Drink Price Verified:** 1 Liter Drink confirmed at Rs160 (correct) — no Rs180 found anywhere in DB.
5. **Crown Crust Deal:** Already Fixed Bundle (`is_combo=false`) with correct items (Crown Crust + Seekh Kabab pizzas). No change needed.
6. **Sunday Deals:** Kept as Slot-Based (`is_combo=true`) — mandatory for "pick your flavor" functionality. Discount values (50/200/300) produce correct final prices (Rs550/750/1050) when variant pricing is used.
7. **3 Pizza Deals:** Verified all slots pull from 21 real pizza products with correct discount tiers (10%/15%/20%).
8. **Deal Images:** All 8 bundles have real product photos set.

### [2026-07-17] Crown Crust Deal: Fixed Bundle → Slot-Based → Split Into 4 Size-Specific Deals
**Files:** `supabase/migrations/20260717130000_crown_crust_slot_based.sql`, `supabase/migrations/20260717140000_split_crown_seekh_into_sizes.sql`, `src/components/estore/StoreDealModal.tsx`, `src/components/estore/StoreFront.tsx`, `src/components/pos/ProductGrid.tsx`, `GEMINI.md`
**Changes:**
1. **DB (Migration 17130000):** Crown Crust Deal converted from fixed bundle (2 forced items) to slot-based (1 slot, 2 options: Crown Crust OR Seekh Kabab).
2. **StoreDealModal:** Added size toggle + variant pricing + toppings sync for slot-based deals. Pricing useMemo uses selected option's variant price. `showSizeToggle`/`tierLabels` extracted as shared hooks for both slot and fixed paths.
3. **StoreFront + ProductGrid price range fix:** Per-slot `bundleMinPrice`/`bundleMaxPrice` calculation (was summing all options' ranges together, giving 2650–3800 instead of 1300–1950).
4. **Migration 17140000 (this change):** Customer feedback — no mixed "choose one" deals. Reverted Crown Crust Deal to single-item fixed bundle (Crown Crust Pizza qty:1). Created 3 new fixed bundles: `Crown Crust Deal - Large` (1850), `Seekh Kabab Deal - Medium` (1350), `Seekh Kabab Deal - Large` (1950). All 4 deals use `override_price` for fixed pricing + `highlight_tag='crown'`.
5. **nameBasedTier:** Added `nameBasedTier` useMemo that auto-derives variant tier from bundle name (`- Medium`→0, `- Large`→1) for override_price deals. `showSizeToggle` returns false when override_price set. `getItemPrice`/`itemPrice` use `nameBasedTier` when available, else `selectedSizeTier`.
6. **handleAdd variant pricing:** Uses `effectiveTier` (name-based or toggle-based) to recalculate cart subtotals with correct variant `priceOverride`.

# 📝 TASK MANAGEMENT RULE (MANDATORY)

For every large or multi-step task, you MUST create a `todo.md` file in the project root (ya agent ka built-in todo tracker use karo — opencode `todowrite` tool) to plan and track your progress.
1. Break down the task into clear, actionable steps.
2. Check off items as you complete them.
3. This ensures you do not forget pending items and allows you to work faster without repeatedly scanning or reading the same files.

### [2026-07-18] Variation Inventory — Per-Variant Stock + Add-On Products
**Files:** `supabase/migrations/20260718010000_variation_inventory.sql`, `SUPER_MASTER_SCHEMA.sql`, `types/index.ts`, `localDb.ts`, `services.ts`, `syncEngine.ts`
**Changes:**
1. **Schema Migration:** New `variant_stock_history` table (per-variant stock audit trail) and `product_addons` table (inventory-tracked add-on products). Added to both `CREATE TABLE` and post-launch `ALTER TABLE` blocks.
2. **Types:** `VariantData` gains `cardTitle`, `cardSubtitle` for display labels. New `VariantStockHistory`, `ProductAddon`, `CartAddonItem` interfaces. `CartItem` gains `selectedVariantId`, `selectedVariantLabel`, `addonItems`.
3. **localDb:** Version 18 adds `variantStockHistory` + `productAddons` Dexie tables. `PendingOpEntity` includes `variant_stock_history` and `product_addons`. Seeding + TABLE_TO_ENTITY updated.
4. **services.ts:** `mapVariantStockHistory` / `toRemoteVariantStockHistory` / `mapProductAddon` / `toRemoteProductAddon` mappers added. New `variantStockHistoryService` and `productAddonsService`. `salesService.create` now deducts variant stock + logs variant stock history; addon product stock deducted independently.
5. **syncEngine.ts:** `variant_stock_history` and `product_addons` registered in `tableMap`.

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
Sab se pehle naye Supabase project ki details in files mein update karein:

1. **`.env.local`** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MGMT_API_KEY`
2. **`.env.local 2`** (pos-admin clone wala env) — same values + `SUPABASE_PROJECT_REF`
3. **`.env`** (Root folder mein, agar exist kare) — same values

> Naming rule: Ye project files `.env.local` aur `.env.local 2` use karta hai — naye files mat banao, inhi ko update karo. Docs/setup.md ka `env_backups/` rule bhi follow karo — kabhi credentials guess/mix nahi.

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
   *Note: `handle_new_user` first-user auto-admin REMOVED (2026-08-16). Role CHECK ab sirf `(cashier, salesman)` hai. Admin role DB level pe auto-set nahi hota — admin user banane ke liye:
   1. User create karo (upar wali command)
   2. Phir `users` table me us user ki row update karke role admin logic app side handle karo — ya pehle user ko app ke andar manually admin banao (app settings > Users > role).
   `user_metadata.role` sirf metadata hai — DB `users.role` column hi authoritative hai.*

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

### [2026-07-24] Full Inventory Integrity Audit + Reconciliation Tool
**Files:** `supabase/migrations/20260724000000_fix_legacy_batches.sql`, `SUPER_MASTER_SCHEMA.sql`, `PurchaseHistory.tsx`, `SupabaseAppContext.tsx`, `CheckoutModal.tsx`, `services.ts`, `InventoryManager.tsx`, `GEMINI.md`, `AGENTS.md`
**Changes:**
1. **DB Migration:** Fixed 12 stock/batch mismatches — deleted 2 phantom LEGACY-BACKFILL-001 batches (999K+ qty), corrected 4 legacy batch quantities, created 4 corrective batches for orphan stock, reset 1 negative stock to 0. All corrections logged to stock_history with `[RECONCILE]` prefix.
2. **PurchaseHistory.tsx:** `handleDeleteRecord()` now correctly restores batch `qty_remaining`, updates embedded `product.batches[]`, and logs `stock_history` entry on purchase record deletion.
3. **SupabaseAppContext.tsx:** `DELETE_SALE` reducer now uses `(total - refundedAmount)` instead of bare `total` for customer credit/purchases reversal. Removed unused `isReturn` variable.
4. **CheckoutModal.tsx:** Bill-edit failure now rollbacks the new sale's stock deduction via `salesService.delete(savedSale.id)` before marking old sale as void (matches CheckoutPage.tsx pattern).
5. **services.ts:** Added `reconcileAllStock(autoFix?: boolean)` — scans all tracked products, compares `products.stock` vs `SUM(product_batches.qty_remaining)`, optionally auto-fixes with corrective batches + stock_history logging.
6. **InventoryManager.tsx:** Added purple "Reconcile" button (Shield icon) in inventory toolbar — one-click stock integrity scan + auto-fix.
7. **GEMINI.md:** Added rules F9 (purchase delete must restore batches), F10 (bill edit must rollback on failure), F11 (reconcile tool must exist).
8. **SUPER_MASTER_SCHEMA.sql:** Added schema change log entry, fixed `variant_stock_history` type CHECK to include `stock_in` and `adjustment_out`.

---

## 📸 Vision Model Prompt Template (Ysha)

Whenever a vision model (e.g. GPT-4o, Claude Sonnet) sends a prompt based on an image/screenshot, it MUST follow the master template. 

> 👉 **START HERE:** Open and copy the complete prompt from [@docs/prompts/CLI_PROMPT_WRITER.md](docs/prompts/CLI_PROMPT_WRITER.md) when initializing a CLI Prompt Writer agent.
## 🗣️ COMMUNICATION RULE (MANDATORY)
- **Short & To the Point:** Always keep your answers extremely short and directly to the point. No long explanations.
- **Language:** ALWAYS reply in **Roman Urdu** (e.g., "Han bhai, fix kar diya hai").
