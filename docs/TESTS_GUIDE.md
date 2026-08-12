# 🧪 TESTS GUIDE — Full System Flow Test Battery (F1–F23)

> **PURPOSE:** One place with EVERY functional test for the whole system — build gates, schema parity, product CRUD (all types), billing, stock, online orders, reports, sync/conflicts, leakage checks. **Koi miss na karo** — har release/change ke baad ye battery chalao.
>
> **MANDATORY RULES:**
> - Tests ALWAYS run on **ALL 4 projects** (ATOLINE, JeanZone, Minimahal, PizzaMilano) — results must be IDENTICAL (MAJOR RULES #5/#6, setup.md).
> - Credentials ONLY from `env_backups/` (har shop ka apna file — kabhi guess/mix nahi).
> - Test data uses FIXED temp IDs (`00...00tXX1` prefixes) + **cleanup at the end** — **zero residue** check mandatory (user rule: created products/records delete karna).
> - DB layer tests via Supabase Management API (`POST /v1/projects/{ref}/database/query`) — never direct connections.
> - Financial flows reference GEMINI.md F-rules; DB functions reference [docs/SYSTEM_FUNCTIONS_GUIDE.md](SYSTEM_FUNCTIONS_GUIDE.md).

---

## 1️⃣ BUILD GATES (har change ke baad)

| # | Command | Expect |
|---|---------|--------|
| 1 | `npx tsc --noEmit` | 0 errors |
| 2 | `npm run lint` | 0 errors |
| 3 | `npm run build` | success, PWA generateSW OK |

---

## 2️⃣ SCHEMA PARITY (F21/F22/F23 registry — all 4 projects, identical)

```sql
SELECT (SELECT count(*) FROM information_schema.triggers WHERE trigger_name LIKE '%stale_write%' OR trigger_name LIKE '%tombstone%') AS f21_guards,
       (SELECT count(*) FROM information_schema.tables WHERE table_name='row_tombstones') AS tombstones,
       (SELECT count(*) FROM pg_proc WHERE proname IN ('guard_stale_write','record_row_tombstone','place_estore_order','trigger_release_estore_stock','get_next_invoice_number','process_sale','process_return')) AS functions,
       (SELECT count(*) FROM information_schema.columns WHERE table_name='purchase_records' AND column_name IN ('variant_id','variant_label')) AS f22_vcols,
       (SELECT count(*) FROM information_schema.triggers WHERE trigger_name='on_store_order_cancelled') AS estore_guard;
```
**Expected (har project):** `f21_guards=24`, `tombstones=1`, `functions=7`, `f22_vcols=2`, `estore_guard=1`.

---

## 3️⃣ PRODUCT CRUD — ALL TYPES (F1/F2 duplicate + stock history mandatory)

| Type | Product flags | Must verify |
|------|--------------|-------------|
| Simple | `product_type='simple'`, qty price | create → edit → delete |
| Variable (parent) | `product_type='variable'`, `variant_data` 2+ variants with stock | variant stocks create/edit |
| Variation child | `product_type='variation'`, `parent_id` | parent-child linkage |
| Electronics | `require_serial=true`, `track_inventory=true` | serial/IMEI tracking flag |
| Restaurant | `is_service=false` + `product_addons` (addon products) + `modifiers` jsonb | addon price/max_qty, cascade on delete |
| Weight-based | `is_weight_based=true`, `price_per_unit` | unit price fields |
| Non-tracked | `track_inventory=false` | stock stays absolute 999999 (no history trigger interference) |

**Steps:** INSERT har type → UPDATE fields (name/price/active) → SELECT verify → DELETE product → verify cascade (stock_history/variant_stock_history/addons rows gone via ON DELETE CASCADE) + **no product with that id remains**.

---

## 4️⃣ STOCK FLOWS (F2/F3/F22 — append-only ledger)

```sql
-- simple stock-in (one entry → trigger updates products.stock)
INSERT INTO stock_history (product_id, change_qty, type, note) VALUES (pid, +N, 'stock_in', 'TEST');
-- variant stock-in (one entry → trigger updates variant_data[].stock)
INSERT INTO variant_stock_history (product_id, variant_id, variant_label, change_qty, type)
VALUES (pid, 'vid', 'M', +N, 'purchase');
-- adjustment (signed)
INSERT INTO stock_history (product_id, change_qty, type) VALUES (pid, -M, 'adjustment');
```
**Verify per step:** products.stock atomic value matches Σ ledger (balance_after check); variant stock matches Σ variant ledger; product.stock INDEPENDENT of variant entries (no double count — F22).

---

## 5️⃣ BILLING FLOW (F4/F7/F10/F12/F13)

| Scenario | Steps | Verify |
|----------|-------|--------|
| Sale deducts stock | INSERT sale (completed, items) + `sale` stock_history −qty per item | products.stock + variant_data[].stock both reduced (no shift columns exist — shift system removed 2026-08-12) |
| Draft (pending) NO stock | INSERT sale status='pending' WITHOUT stock_history | stock UNCHANGED (drafts ≠ revenue — F13) |
| Bill edit (atomic) | UPDATE sale (fresh updated_at) | accepted (newest-wins); stale update rejected P0007 |
| Sale delete restores ONCE | DELETE sale + ONE `return` stock_history +qty (F12 single reversal) | stock back to pre-sale; tombstone blocks re-insert |
| Variant sale delete | same but via ONE `variant_stock_history` 'return' entry | variant stock restored ONCE |

**Duplicate prevention (F1):** same sku/name second INSERT must be caught at UI level (code audit: product name/sku duplicate check in `productsService.create`).

---

## 6️⃣ ONLINE ORDER FLOW (estore → store_orders → POS) (F21-estore)

| Scenario | Steps | Verify |
|----------|-------|--------|
| Place order (reserve) | `SELECT place_estore_order(jsonb)` with 2 items (tracked + non-tracked) | order row inserted; **tracked product stock −qty** (reservation); non-tracked untouched |
| Cancel unfulfilled order | UPDATE order status → 'cancelled' | `trigger_release_estore_stock` inserts +qty 'return' → stock restored |
| Fulfil → POS sale | UPDATE order status 'delivered' + `fulfilled_sale_id` + completed sale row | order-sale link; no double deduction (fulfilled orders never release twice) |
| Orders with variants | order item contains variant ref → variant stock reserved too | variant_data[].stock −qty |

---

## 7️⃣ REPORTS INTEGRITY (F6/F14/F15/F16)

| Check | Method | Expect |
|-------|--------|--------|
| Drafts excluded | code audit: reports query `.neq('status','pending')` | pending sales kabhi revenue nahi |
| No truncation | code audit: NO `.limit()`/`.slice(0,N)` on sales/expenses/payments for totals | `fetchAllPages()` used |
| Refund dedupe | code audit: partial-refund merge by sale id (sales copy wins) | exempt: `getReportSales` + refunds merge pattern |
| Wallet direction | code audit: `p.direction !== 'out'` collections filter + refunded sales subtracted | en F16 |

---

## 8️⃣ SYNC / CONFLICT (F17–F21)

| Check | Method | Expect |
|-------|--------|--------|
| P0007 handling | code audit `syncEngine.ts` | op dropped + cloud refresh (never error-retry loop) |
| Tombstone | INSERT after DELETE same id | P0007 `STALE_WRITE` |
| Newest-wins | UPDATE with older updated_at | rejected; newer accepted |
| Queue merge | code audit `localDb` F17 rules | delete survives update; merge resets retries |
| Fetch failure | code audit F19 | `.catch(()=>[])` never on leading merge source |

---

## 9️⃣ LEAKAGE / RESIDUE (user rule: test data cleanup mandatory)

```sql
SELECT (SELECT count(*) FROM products  WHERE id LIKE '00000000-0000-4000-8000-00000000t%')  AS prod,
       (SELECT count(*) FROM sales     WHERE id LIKE '00000000-0000-4000-8000-00000000t%')  AS sales,
       (SELECT count(*) FROM store_orders WHERE id LIKE '00000000-0000-4000-8000-00000000t%') AS orders,
       (SELECT count(*) FROM stock_history WHERE note LIKE '%TESTS-GUIDE%')  AS hist,
       (SELECT count(*) FROM variant_stock_history WHERE note LIKE '%TESTS-GUIDE%') AS vhist,
       (SELECT count(*) FROM row_tombstones WHERE ref_id::text LIKE '00000000-0000-4000-8000-00000000t%') AS tombs;
```
**Expect:** ALL = 0. Koi bhi test data production mein nahi rehta. TEST-xxx names/skus bhi zero residue.

---

## 🔟 TEST LOG (har run ka record yahan add karo)

| Date | Build | Schema | Products | Stock | Billing | Estore | Reports | Sync | Residue | Verdict |
|------|-------|--------|----------|-------|---------|--------|---------|------|---------|---------|
| 2026-08-12 (R1) | ✅ | ✅ 4/4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | ✅ full system flow PASS |
| 2026-08-12 (R2) | ✅ | ✅ 4/4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | ✅ returns/deals/batches PASS |

### 2026-08-12 — Round-2 Battery (returns, deals, batches, reports, online)
**13/13 PASS identical on ALL 4 projects — zero issues found, zero leakage:**
- Deal/bundle: create (slot + 2 options + item) ✅, delete cascades slots/options/items ✅
- Product batches FIFO (opening + purchase) ✅
- Adjustment signed −3 → stock 17 ✅
- Expense create ✅ + **stale edit rejected P0007** ✅ (expenses guarded too)
- Payment create (direction 'in') ✅ + **stale edit rejected P0007** ✅ (payments guarded too)
- **FULL refund restores stock ONCE** (17/50) ✅ (F12 no double-reversal)
- **PARTIAL refund restores ONLY refunded qty** (14+1=15) ✅ (F13/F15)
- Reports exclude pending/refunded ✅ (F13 — per-shop revenue counts all correct)
- **Fulfilled estore order cancel does NOT double-release stock** ✅ (F21-estore guard)
- Restaurant product delete cascades addons/history ✅
- Cleanup: **residue 0** (products/sales/orders/expenses/payments/history/variant-history/bundles/batches/tombstones) — 4/4 projects

### 2026-08-12 — Full System-Flow Battery (first complete run)
**Scope:** products all types, stock ledger, billing (draft/edit/delete/resurrect), estore order/variant/cancel/fulfil, P0007, residue.

**FOUND & FIXED (3 real issues):**
1. **ESTORE ORDERING BROKEN (critical, all 4 projects):** `place_estore_order` referenced columns `address`/`table_number`/`fulfillment_mode` that never existed in `store_orders`, AND cast `reference_id` (UUID) as `::text` → EVERY online order + every cancel raised DB error. **Fixed** (migration `20260812235500_fix_estore_place_order_bugs.sql`): use `delivery_address` (jo app bhejta hai), UUID refs, **variant-aware reservation/release (F22)**. Verified: order reserve −2, variant reserve −2, cancel release +2, fulfil→sale link — 4/4 PASS, deployed all 4.
2. **MINIMAHAL schema divergence:** `products.product_type` (aur is_service/require_serial/is_weight_based/price_per_unit/unit/parent_id) columns **missing** — post-launch ALTER block ka omission. Variable products is shop par save nahi hote the. **Fixed** (migration `20260813000000_fix_products_variant_history_schema_parity.sql`, master schema post-launch block bhi) → `pt=1` confirm.
3. **PIZZAMILANO schema divergence:** `variant_stock_history.type` CHECK mein `'purchase'` (aur signed reversal types) missing → variant stock-in crash. **Fixed** — constraint sab par normalized to 7-type set. Confirm `vh_purchase=1`.

**Results after fixes (identical on ALL 4):** products create (simple+variable) ✅, stock_in +10→30 ✅, variant stock_in +3→8 ✅, sale deduct −2→28 ✅, draft no-deduct ✅, stale edit P0007 ✅, delete restore ONCE ✅, tombstone blocks resurrect ✅, estore reserve −2 ✅, estore variant reserve ✅, cancel release ✅ = **11/11 PASS, residue 0/4 projects**.
**Reports layer (code audit):** F13 drafts excluded ✅ (services.ts:1902), F14 fetchAllPages no truncation ✅, F15 refund dedupe merge ✅, F16 wallet out-direction excluded ✅ (ReportsManager:724-758 + TransactionsManager:294-315).

*Previous: 2026-08-12 F21+F22 guard battery 16/16 + variant ledger 5/5 (SYSTEM_FUNCTIONS_GUIDE §7).*