# ⚙️ SYSTEM FUNCTIONS GUIDE — DB Guards, Triggers & Financial Flow

> **PURPOSE:** This is the single source of truth for EVERY database function/trigger and every financial data flow in the system. Whenever you touch SQL, sync, or financial logic — read this FIRST, follow the pattern, and UPDATE this guide in the same change.
>
> **MANDATORY RULE:** Any NEW financial table or function MUST follow the guard pattern (§6 checklist) and MUST be registered here + tested with the battery (§7). Never add a financial write path without its guards — that is a violation.

---

## 1️⃣ LAYER MAP (kiska kaam kya hai)

```
┌─────────────────────────────────────────────────────────┐
│  APP LAYER (src/)                                       │
│  · src/lib/services.ts        — all CRUD, applyVariant-  │
│    StockMovement, reconcileAllStock                      │
│  · src/lib/syncEngine.ts      — offline queue, P0007     │
│    handling, realtime merge, prune policies              │
│  · src/lib/stockInCommit.ts   — SHARED commitStockIn-    │
│    ToInventory (har stock-in path isi se)                │
│  · src/lib/localDb.ts         — Dexie IndexedDB          │
├─────────────────────────────────────────────────────────┤
│  SUPABASE LAYER (DB-enforced — sab se powerful)          │
│  · guard_stale_write()        — F21 newest-wins +        │
│    tombstone block (BEFORE INSERT/UPDATE)                │
│  · record_row_tombstone()     — F21 AFTER DELETE         │
│  · update_updated_at_column() — preserves client time    │
│  · trigger_update_product_stock()  — F2 ledger →         │
│    products.stock                                        │
│  · trigger_update_variant_stock() — F22 ledger →         │
│    products.variant_data[].stock                         │
│  · trigger_release_estore_stock() — estore cancel →      │
│    stock wapas                                            │
│  · place_estore_order(), process_sale(), process_return(),│
│    get_next_invoice_number()   — RPCs                     │
└─────────────────────────────────────────────────────────┘
```

---

## 2️⃣ FULL FUNCTION/TRIGGER REGISTRY (verified live on ALL 4 projects — 2026-08-12)

| # | Name | Type | Table(s) | Job | Verified |
|---|------|------|----------|-----|----------|
| 1 | `guard_stale_write()` | BEFORE INSERT OR UPDATE trigger | `sales`, `stock_history`, `variant_stock_history`, `purchase_records`, `expenses`, `payments`, `store_orders`, `sales_tabs` (8 tables × 3 = **24 triggers**) | F21: tombstoned id → raise; `NEW.updated_at < OLD.updated_at` → raise `STALE_WRITE`/`P0007` | ✅ 16/16 live PASS |
| 2 | `record_row_tombstone()` | AFTER DELETE trigger (same 8 tables) | — | F21: deleted row ka id `row_tombstones` mein register — resurrection impossible | ✅ PASS |
| 3 | `update_updated_at_column()` | BEFORE UPDATE trigger (19 tables) | — | Client timestamp preserve karo jab wo naya ho; warna `NOW()` | ✅ PASS |
| 4 | `trigger_update_product_stock()` | AFTER INSERT on `stock_history` | `products.stock = stock + change_qty` | F2 append-only ledger | ✅ PASS-4 |
| 5 | `trigger_update_variant_stock()` | AFTER INSERT on `variant_stock_history` | updates `variant_data[].stock` of matching variant `id` | F22 variant ledger | ✅ PASS-2/5 (2→5→2) |
| 6 | `trigger_release_estore_stock()` | AFTER UPDATE on `store_orders` WHEN status → `cancelled` | releases reserved stock (product + variant-aware, F22); skips fulfilled orders (`fulfilled_sale_id IS NULL`) | estore cancel guard | ✅ PASS +2 release |
| 7 | `place_estore_order()` | RPC | inserts order (delivery_address) + reserve: product→`stock_history`, variant item→`variant_stock_history` (F22) | estore checkout | ✅ PASS reserve tracked+variant |
| 8 | `process_sale()` / `process_return()` | RPC | atomic sale/return | invoice/stock committed server-side | ✅ present |
| 9 | `get_next_invoice_number()` | RPC | invoice sequence | collision-safe invoice numbers | ✅ present |

> ⚠️ **2026-08-12 FIX (TESTS_GUIDE battery):** estore functions were BROKEN on all projects — referenced never-existing columns (`address`/`table_number`/`fulfillment_mode`) + `reference_id` UUID cast `::text`. Fixed in migration `20260812235500_fix_estore_place_order_bugs.sql`: `delivery_address` used (jo app `toRemoteStoreOrder` bhejta hai), UUID refs, variant-aware reserve/release. Also fixed `products` post-launch columns (Minimahal missing `product_type` etc.) + `variant_stock_history` CHECK 7-type set (PizzaMilano missing `'purchase'`) — migration `20260813000000_fix_products_variant_history_schema_parity.sql`.

> ⚠️ `reconcile_all_stock` is a **client-side** function (`reconcileAllStock()` in `src/lib/services.ts`) — intentionally NOT a DB function. F11 rule.

---

## 3️⃣ FLOW — F21 STALE-WRITE / CROSS-DEVICE CONFLICT (stale write ka end)

```
Device A: cancels sale S (10:00)      Device B: edits sale S (10:05, purana data)
     │                                       │
     └── DELETE sales S ───────────────────────┐
               v                                v
     record_row_tombstone() → row_tombstones += S      B syncs UPDATE sales S
               │                                        │
               │                                 guard_stale_write():
               │                                   (a) S tombstoned → RAISE P0007
               │                                   (b) NEW.updated_at(10:05) < OLD? required check
               v                                        v
   Cloud row deleted forever                     SyncEngine: P0007 → op DROPPED
                                                       (payload outdated hai — retry bekaar)
                                                       + realtime/merge se cloud version
                                                       wapas aa jata hai device par
```

**Same sale dono devices par EDIT karen (delete nahi):** jo bhi `updated_at` **chhota** (purana) → reject; jo **bada** (naya — "jo last hua wohi final") → accept. Test: `PASS-2 rejected stale` + `PASS-3 fresh accepted`.

**NOT guarded:** `products`, `customers`, `suppliers` — variation child ids reuse hote hain, is liye wo client-side skip se chalte hain (F21 rule line in GEMINI.md).

---

## 4️⃣ FLOW — F22 VARIANT-RESTOCK LEDGER (variant stock ka ek hi rasta)

```
Stock-in ya variant edit (kisi bhi screen se — BatchStockIn,
ProductDetailHub quick restock, StockInModal):
     │
     └──► commitStockInToInventory()  ← SHARED helper (src/lib/stockInCommit.ts)
               │   ⚠️ Parallel stock-in implementations BANNED
               ├── purchaseRecordsService.create()
               │      └─ purchase_records row + variant_id/variant_label
               │      └─ variant_stock_history ONE 'purchase' entry (+qty)
               │             └─► TRIGGER on_variant_stock_history_insert
               │                    └─► trigger_update_variant_stock()
               │                         └─ products.variant_data[].stock += qty
               └── applyVariantStockMovement()  (services.ts)
                      └─ local Dexie variantData bhi update
                      
DELETE (reversal): purchaseRecordsService.delete() → ONE 'adjustment' entry (−qty)
                   → trigger wapas minus → single-reversal (F12) variant level par bhi
```

**Never** `variant_data` ko product payload mein bhej kar stock change karo — wo column sync par **strip** hota hai aur chup chaap data loss hota hai. Hamesha `variant_stock_history` se (F22).

---

## 5️⃣ FLOW — SYNC & RECOVERY (syncEngine.ts)

- **P0007 / `stale_write` response** → op `drop` (error-queue NAHI — retry kabhi kamyab nahi ho sakta) + cloud se refresh. `F20`: type/constraint errors (`22P02`/`22003`/`23514`) → op **error** mark (owner review) — kabhi hard-delete mat karo.
- **F17** queue merge: queued `delete` survives later update (delete wins); merge par `retries:0` + `status:'pending'` wapas.
- **F18** realtime: sales UPDATE events skip pending-local-change rows; stock_history raw snake_case rows ko `mapStockHistory()` se map karo.
- **F19** fetch failure: `.catch(() => [])` kabhi leading merge source par mat lagao — warna local cache wipe.
- **Retention:** cancelled orders 24h prune; stock_history 90-day prune + 5000 cap (startup par chalta hai).

---

## 6️⃣ 📋 CHECKLIST — NAYA FINANCIAL TABLE / FUNCTION ADD KARNA (MANDATORY)

Har naya financial write path (table ya function) isi pattern par banana hai — wohi code, wohi guards:

1. **Schema:** `supabase/migrations/YYYYMMDDHHMMSS_desc.sql` + `SUPER_MASTER_SCHEMA.sql` mein `CREATE TABLE IF NOT EXISTS` + post-launch `ALTER TABLE ADD COLUMN IF NOT EXISTS` block (existing DBs create-table skip karti hain!).
2. **Guards (F21):** 3 triggers add karo — `guard_stale_write_<table>` (BEFORE INSERT OR UPDATE), `record_row_tombstone_<table>` (AFTER DELETE), `update_<table>_updated_at` (BEFORE UPDATE). Table mein `updated_at TIMESTAMPTZ` column hona chahiye.
3. **Append-only ledger (F2/F22):** agar stock/log table hai → own trigger `<on_<table>_insert>` jo parent aggregate update kare; direct `products.stock`/`variant_data` writes client se kabhi nahi.
4. **Service layer:** `src/lib/services.ts` mein CRUD — reversal/single-reversal (F12) service ke andar, UI mein kabhi nahi. Shared helper use karo (stock-in → `commitStockInToInventory`).
5. **localDb:** `src/lib/localDb.ts` sync karo (table + mapper).
6. **SyncEngine:** P0007 drop branch, queue merge rules (F17), realtime guards (F18) — naye table ko bhi.
7. **REGISTER:** YEH GUIDE (§2 registry) + `GEMINI.md` SCHEMA CHANGE LOG + `AGENTS.md` (agar naya rule banaya) — same change mein.
8. **TEST BATTERY (§7) — live READY-TO-RUN curl** sab 4 projects par chalao aur PASS verify karo — bina verify "done" nahi.

---

## 7️⃣ 🧪 TEST BATTERY (ready-to-run — Management API)

Credentials: `env_backups/` folder se har shop ka `SUPABASE_MGMT_API_KEY` (kabhi guess nahi).

**A) Schema inventory (sab 4 projects):**
```sql
SELECT (SELECT count(*) FROM information_schema.triggers WHERE trigger_name LIKE '%stale_write%' OR trigger_name LIKE '%tombstone%') AS f21_guards,
       (SELECT count(*) FROM information_schema.tables WHERE table_name='row_tombstones') AS tombstones,
       (SELECT count(*) FROM pg_proc WHERE proname IN ('guard_stale_write','record_row_tombstone','place_estore_order','trigger_release_estore_stock','get_next_invoice_number','process_sale','process_return')) AS functions;
```
Expected: `f21_guards=24`, `tombstones=1`, `functions=7` (har project par identical).

**B) Live guard battery (har project, self-cleaning — temp ids `...a101/a102/a103`):**
```
INSERT sale → stale UPDATE (updated_at = now() - 1 hour) → expect P0007 PASS
→ fresh UPDATE → PASS → DELETE sale → re-INSERT same id → expect P0007 PASS (tombstone)
→ fresh INSERT naye id → PASS   [akhir mein test rows + tombstones DELETE]
```
Full SQL: reprex GEMINI.md F21 / is guide ke sesion history mein (2026-08-12 battery).

**C) Variant ledger live (1 project):**
```
product with variant_data[{id:'v1',stock:2}] → INSERT variant_stock_history +3 'purchase'
→ expect products.variant_data[].stock = 5, products.stock UNCHANGED
→ INSERT -3 'adjustment' → expect 2 → DELETE product → residue 0/0/0 (cascade)
```

**D) Residue check (har project):** `count` test ids — har ek `= 0`. Production kabhi test data se pollute nahi.

---

## 8️⃣ TROUBLESHOOTING CHEATSHEET (DB)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `P0007`/`STALE_WRITE` on sync | deleted ya purani row ki write — by design | kuch nahi — op drop hota hai, cloud refresh hota hai |
| `AUTO-BLACKLISTED COLUMN: xyz` | column Supabase par missing | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (post-launch block) |
| Variant stock change "show nahi hota" | `variant_data` direct product payload se bheja | `variant_stock_history` flow use karo (F22) |
| Stock double-counted | UI handler ne service ke baad phir stock reverse kiya | reversal sirf owning service mein (F12) |
| Queue par op stuck "pending" | merge ne retries/status reset nahi kiye | F17 merge rules check |
| Report totals galat | `.limit()`/`.slice` ya refunds double-merge (F14/F15) | `fetchAllPages()` + sale-id merge (sales copy wins) |

---

*Last verified: 2026-08-12 — F21+F22 full battery, 4/4 projects, 16/16 PASS, zero residue. Keep this guide updated in the SAME change as any schema/flow change.*
## 5️⃣ CORE DATA GOVERNANCE RULES (Enforced in Code & DB)

### 🚫 SHIFT SYSTEM PERMANENTLY REMOVED (Rule F7)
The legacy shift system (`shift_id`, `shift_status`) has been permanently eradicated from all clones and databases as of 2026-08-12.
- **SQL / DB**: No table, function, or view contains `shift_id`.
- **Codebase**: The UI, `localDb`, and `syncEngine` are completely decoupled from shifts.
- **Rule**: Never reintroduce shifts. Any attempt to add shift dependencies will corrupt global financial reporting.

### 🗑️ 24-HOUR AUTO-DELETE FOR CANCELLED ONLINE ORDERS
To prevent database bloat without affecting POS financials:
- **Location**: `src/lib/syncEngine.ts` -> `pruneExpiredCancelledOrders()`.
- **Trigger**: Runs automatically inside `startSyncEngine()` on startup (and hourly).
- **Behavior**: Scans for `store_orders` where `status = 'cancelled'` and `updated_at` is older than 24 hours. Deletes them from the local cache and queues a remote hard-delete.
- **Safety**: `trigger_release_estore_stock()` releases stock instantly upon cancellation. The 24-hour delayed deletion only removes the ghost record (it has zero inventory side-effects since stock was already restored).

