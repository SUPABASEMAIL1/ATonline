# 🛠️ MASTER_AGENT_REPAIR_AND_VERIFY.md
## POS v12.2 — Real-World Production Repair Protocol (Executable, No Filler)

> **What this is:** an executable protocol for an agent that has real access to the actual repo, the
> real database, and can run real migrations. It assumes the codebase described in the prior audits
> (`POSTerminal`, `useCartCalculations`, `CheckoutPage`, `salesService.create`, `commit_sale` RPC,
> `supplierTransactions`, `RequireAccess`, `store_orders`) is the real target. Every rule below is either
> (a) already true in the current code and must be preserved, or (b) a known/likely gap and must be
> closed — root cause, not patch. If the agent finds the real code differs from what's assumed here,
> **the real code wins** — this document defines the destination, not a fantasy of the current state.

> **Definition of done:** not "it builds", not "the bug is gone". Done = every invariant in §7 holds
> after a real end-to-end run (§13) on real (or realistic seeded) data, verified by query, not by eye.

---

## §0. NON-NEGOTIABLE RULES (read every time before touching code)

1. Stock, wallet balance, supplier balance, customer balance are **never written directly**. They are
   always the sum of an append-only ledger. If you find `product.stock = X` anywhere outside the ledger
   insert transaction, that is a bug to fix, not a pattern to copy.
2. Every sale/refund/purchase/adjustment carries an **idempotency key** and a **DB unique constraint**
   that makes a retried/duplicated request a no-op, not a second row.
3. Every checkout, refund, supplier payment, and expense is **one database transaction**. Partial
   success is not allowed — it's all-or-rollback.
4. Supplier ledger and customer ledger are **never** the same table as wallet/payment balances. A
   supplier payment is two linked writes (wallet OUT + supplier ledger paid), one transaction.
5. Permissions are enforced **server-side**, always — regardless of what the UI shows or hides. A
   UI-only permission is not a permission.
6. A completed sale is immutable. Corrections are new linked transactions (refund/void/adjustment) that
   reference the original — never an UPDATE on historical totals.
7. Every module (POS, E-store, receipts, reports) calls **one shared pricing/tax function**. No module
   reimplements subtotal/discount/tax math independently.
8. Nothing is declared fixed without re-running the reconciliation queries in §7 against real data and
   getting `0` mismatch — not "looks right in the UI".

---

## §1. WHAT ALREADY WORKS — DO NOT BREAK, DO NOT REINVENT

Confirmed by prior source-level audit. Treat these as **regression-protected** — write a test that pins
this behavior before touching anything nearby.

| # | Behavior | Where |
|---|---|---|
| P1 | POS is the sole inventory-mutating path; E-store order placement never touches stock | `salesService.create`, `StoreCheckout.tsx` |
| P2 | Draft sales never touch stock/revenue | `salesService.create` DRAFT rule |
| P3 | Refund is idempotent — re-running an already-refunded request is a no-op | `refundSaleAtomic` |
| P4 | Bill-edit is two-phase (create new → delete old, rollback new if delete fails) | `CheckoutPage.tsx` |
| P5 | Supplier bill creation is idempotent per `referenceId` — same stock-in never double-billed | `suppliersService.recordBill` |
| P6 | Delivery fee, when loaded from E-store to POS, becomes a taxed cart line (`isService`) | `OnlineOrdersPage.tsx` |
| P7 | Direct-POS manual delivery/extra charge is now taxed identically to the E-store path (`extraChargesTax`) | `CheckoutPage.tsx` |
| P8 | E-store deal/bundle pricing is variant-tier aware and matches modal↔cart↔checkout | `StoreDealModal.tsx`, `getBundleCartItems` |
| P9 | Free-gift items carry COGS so profit isn't overstated | `useCartCalculations` |
| P10 | Sales-tab close/switch saves the live cart before switching (was previously lossy) | `SalesTabManager.tsx` |
| P11 | Order-again on E-store restores exact variant + toppings | `StoreFront.tsx handleOrderAgain` |
| P12 | OrderTracker auto-deliver timer no longer fires on a stale/cancelled order | `OrderTracker.tsx` |
| P13 | Offline-first: local write succeeds immediately, cloud RPC commits async, sync engine queues | `syncEngine.ts`, `commitSaleAuthoritative` |

**Before any refactor touching these areas, write a failing-if-broken test for the row above, THEN change code.**

---

## §2. CONFIRMED CRITICAL DEFECT — FIX FIRST, BEFORE ANYTHING ELSE

**Permission system is not real.** `AuthContext.tsx` forces every account to `role:'cashier'`.
`RequireAccess` (`App.tsx`) is a no-op — every route, including `/settings`, `/users`, `/suppliers`,
`/database`, is open to anyone with a login. This is a live production risk: any logged-in user can
delete sales, edit settings, export the database, or issue unlimited refunds.

**This must be fixed before any other structural work**, because every other repair (refund limits,
stock-adjustment audit, supplier edit protection) is meaningless if there is no real authorization layer
underneath it.

### §2.1 Required minimum viable fix (do this first, in isolation, deploy it, verify it, THEN continue)
1. Add real `role` to the user/profile table (`admin`, `manager`, `cashier`, `salesman` at minimum).
2. Build one `PERMISSIONS` map: `{ role: { action: boolean | limit } }` — single file, single source.
3. `RequireAccess(action)` checks `PERMISSIONS[currentUser.role][action]` and blocks/redirects if false.
   Delete the no-op version entirely — do not leave both old and new logic present.
4. **Every** Supabase RPC / API endpoint that performs a sensitive action (refund, delete sale, settings
   write, user management, database export) re-checks the caller's role server-side (RLS policy or RPC
   guard) — never trust that the frontend already checked.
5. Write a test that logs in as `cashier` and attempts, via direct API call (not UI), to hit
   `/settings`, `/users`, `delete_sale_atomic`, `refund_sale_atomic` beyond their limit — every one must
   be rejected with a real authorization error.
6. Only after this passes: proceed to the rest of this document.

---

## §3. PAGE / MODULE / DATA-FLOW MAP (what talks to what, and how)

```
PRODUCTS (canonical: productId + variantId + barcode/SKU)
   │
   ▼
INVENTORY  ── /inventory ──────────────────────────────────────────
   tabs: Products | Stock Adjustment | Restock (Purchase-In) |
         Stock History/Ledger | Low-Stock Alerts | Reconciliation
   only writer of product.stock: the ledger-insert transaction
   │                                            │
   ▼                                            ▼
POS  ── /pos ──────────────────         E-STORE  ── /store ──────────
  tabs: Sale | Sales-Tab Mgr |            Storefront → Product/Deal
        Drafts | Transactions |          Modal → Cart → Checkout →
        Refunds                          Order Tracking → Past Orders
  popups: ProductOptions,                        │
  Combo/Deal, Promotion,                          ▼
  CameraScanner, Customer          ADMIN: /orders (OnlineOrdersPage)
  Select, Split-Payment,             Active | Past | Detail Drawer |
  Receipt/KOT, RefundSale,           Status Actions | Load-to-POS |
  TransactionDetail                  Cancel
        │◄──────── Load-to-POS (the ONLY inventory-affecting bridge) ────┘
        ▼
CheckoutPage → salesService.create → Sale + Stock Ledger + Payment Movements
        │
        ▼
PAYMENTS/WALLETS (paymentModes: cash/card/bank/online) — ledger-based
        │
   ┌────┼─────────────────┬─────────────────────┐
   ▼    ▼                 ▼                     ▼
EXPENSES  SUPPLIER LEDGER (supplierTransactions)  CUSTOMER LEDGER
          — never merged with paymentModes         — never merged with paymentModes
        │
        ▼
SETTINGS ── /settings ── single source: general, tax/currency, receipt,
            payment methods, e-store, barcode/printer, discounts,
            users & permissions, backup/database, security
        │
        ▼
REPORTS ── /reports ── Sales | Inventory | Purchases/Supplier |
           Financial | Customer | Cashier/Salesman performance |
           Reconciliation Dashboard — ALL derive from the SAME
           shared functions (getEffectiveTotal, getBalance, etc.)
```

**Rule:** an arrow = "reads shared state" or "calls one canonical service function." No box mutates
another box's table directly. If the agent finds E-store code touching `product.stock`, or a report
computing its own tax formula instead of calling the shared one — that's a violation, fix it.

---

## §4. INVENTORY — EXACT LEDGER MODEL

```sql
-- conceptual shape, adapt to actual DB (Postgres/Supabase)
stock_history (
  id                uuid primary key,
  product_id        uuid not null,
  variant_id        uuid null,
  quantity_delta    numeric not null,       -- signed
  before_qty        numeric not null,
  after_qty         numeric not null,
  movement_type     text not null check (movement_type in (
                       'OPENING','PURCHASE_IN','SALE_OUT','RETURN_IN',
                       'SUPPLIER_RETURN_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT',
                       'DAMAGE_OUT','LOSS_OUT','TRANSFER_IN','TRANSFER_OUT',
                       'REVERSAL_IN','REVERSAL_OUT')),
  reference_type    text,                   -- 'sale' | 'purchase' | 'return' | ...
  reference_id      uuid,
  unit_cost         numeric,
  reason            text,
  created_by        uuid not null,
  created_at        timestamptz not null default now()
);

-- prevents the exact same event from posting twice
create unique index ux_stock_history_idem
  on stock_history (reference_type, reference_id, movement_type, coalesce(variant_id, product_id));
```

### §4.1 Formula (must hold for every product/variant, always)
```
current_stock == opening_stock
                + Σ(PURCHASE_IN, RETURN_IN, ADJUSTMENT_IN, TRANSFER_IN, REVERSAL_IN)
                − Σ(SALE_OUT, SUPPLIER_RETURN_OUT, DAMAGE_OUT, LOSS_OUT, TRANSFER_OUT, REVERSAL_OUT)
```

### §4.2 Negative stock
Current system allows it (`salesService.create`, line ~113). **Do not silently change this** — it's a
business decision. Make it explicit:
- `settings.allowNegativeStock` (boolean, default = current behavior, i.e. `true` unless confirmed
  otherwise with the business owner).
- If `true`: POS cart must show a visible "will go negative" badge on the line before checkout.
- If `false`: checkout validation blocks the sale server-side (not just UI) when stock is insufficient.

### §4.3 Reconciliation job (must exist, must run, must not auto-silently-correct)
```sql
-- nightly / on-demand
select product_id, variant_id,
       (select opening_stock ...) 
       + sum(case when quantity_delta > 0 then quantity_delta else 0 end)
       - sum(case when quantity_delta < 0 then -quantity_delta else 0 end) as expected_stock,
       products.stock as actual_stock
from stock_history join products ...
group by product_id, variant_id
having expected_stock != actual_stock;
```
Any row returned = write to `stock_mismatches` table, surface on Reconciliation Dashboard, require
manual approval to correct (which itself inserts an `ADJUSTMENT_IN`/`OUT` row referencing the mismatch
record — never a raw UPDATE).

### §4.4 Restock / adjustment audit requirement
- Every direct occurrence of `product.stock =`, `variant.stock =`, `stock +=`, `stock -=`,
  `UPDATE products SET stock` in the entire repo must be found (`grep -rn` across the codebase) and
  classified: is it inside a ledger-insert transaction, or is it a rogue direct writer? Rogue writers
  must be refactored to go through the ledger service.

---

## §5. POS CHECKOUT — EXACT ATOMIC SEQUENCE

```
1. VALIDATE      cart items still exist, prices current, stock sufficient (unless allowNegativeStock)
2. CALCULATE     via the ONE shared calculateCart() — never re-derive totals ad hoc
3. VALIDATE      split payment legs sum exactly to total (server-side, not just frontend)
4. BEGIN TRANSACTION (single DB transaction / single RPC call, e.g. commit_sale)
     a. insert sale + sale_items
     b. insert stock_history rows (movement_type = SALE_OUT), idempotency key = sale.id
     c. insert payment_movements rows per tender leg (direction = IN)
     d. update customer ledger if customer attached
     e. if fulfilling a store_order: update status='converted', fulfilled_sale_id = sale.id
        (idempotent: if store_order already converted, reject the second attempt — see §5.1)
   COMMIT (any failure at any step ⇒ full ROLLBACK, nothing partially persists)
5. Refresh local cached stock/wallet snapshot FROM the ledger (not from an in-memory guess)
6. Print receipt / KOT
```

### §5.1 Two cashiers loading the same online order
`store_orders` needs a status/lock check inside the same transaction as step 4e: `UPDATE store_orders
SET status='converted', fulfilled_sale_id=$1 WHERE id=$2 AND status='accepted'` — if zero rows affected
(because another terminal already converted it), the whole sale transaction must roll back and the
cashier must see "this order was already fulfilled elsewhere," not silently create a second sale for the
same order.

### §5.2 Idempotency at the network layer
Every checkout submission (online or from the offline queue) carries a client-generated
`idempotency_key` (UUID, generated once when checkout begins, reused on retry). The `commit_sale` RPC
must treat a repeated key as a no-op returning the original sale, not a new insert. This is the actual
mechanism that prevents double-click / browser-refresh / offline-replay duplicate sales — a disabled
button alone does not achieve this.

---

## §6. MONEY — LEDGER MODEL FOR WALLETS, SUPPLIER, CUSTOMER

```sql
payment_movements (
  id uuid primary key,
  mode_id uuid not null,              -- references payment_modes (cash/card/bank/online)
  amount numeric not null,            -- always positive; direction is separate
  direction text not null check (direction in ('IN','OUT')),
  reference_type text not null,       -- 'sale' | 'refund' | 'purchase' | 'supplier_payment'
                                       -- | 'expense' | 'manual' | 'cash_drop'
  reference_id uuid,
  is_manual boolean not null default false,
  reason text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create unique index ux_payment_movements_idem
  on payment_movements (reference_type, reference_id, mode_id, direction);
```

`wallet_balance(mode_id) = Σ amount WHERE direction='IN' − Σ amount WHERE direction='OUT'` — always
derived, never stored-and-trusted (a cached column is fine for read speed, but it's rebuildable and the
nightly reconciliation must assert cache == derived sum).

### §6.1 What triggers what (exact, no exceptions)
| Event | Wallet | Supplier ledger | Customer ledger | Expense table |
|---|---|---|---|---|
| Sale (per tender leg) | +amount IN | — | +purchase record if credit sale | — |
| Refund/return (proportional) | −amount OUT | — | −refund record | — |
| Purchase paid immediately | −amount OUT | — | — | — |
| Purchase on credit | untouched | +amount payable | — | — |
| Supplier payment | −amount OUT | −amount (reduces payable) | — | — |
| Expense | −amount OUT (chosen mode) | — | — | +expense row |
| Manual cash-in/out ("lena-dena") | ±amount, `is_manual=true`, reason required | — | optional linked entry if tied to a party | — |
| Cash drop / drawer payout | −amount OUT, `reference_type='cash_drop'` | — | — | — |

Supplier payment and Expense are each **exactly two linked writes in one transaction** — never one side
without the other.

### §6.2 Supplier ledger stays structurally separate
```
outstanding_payable(supplier_id) = Σ bills − Σ payments − Σ supplier_returns ± manual_adjustments
```
computed from `supplierTransactions` only — this table must never be joined into or confused with
`payment_modes` balance in any report or calculation.

---

## §7. NON-NEGOTIABLE INVARIANTS (the actual acceptance test — run these as real queries)

```sql
-- I1: inventory
select product_id from stock_history_reconciliation_view where expected != actual;
-- must return 0 rows

-- I2: wallet
select mode_id from payment_modes where balance != (
  select coalesce(sum(case when direction='IN' then amount else -amount end),0)
  from payment_movements where mode_id = payment_modes.id
);
-- must return 0 rows

-- I3: supplier
select supplier_id from suppliers where balance != (
  select coalesce(sum(...),0) from supplierTransactions where supplier_id = suppliers.id
);
-- must return 0 rows

-- I4: sale ⇔ stock exactly once
select sale_id from sales s where (
  select count(*) from stock_history where reference_type='sale' and reference_id=s.id
) != (select count(*) from sale_items where sale_id = s.id);
-- must return 0 rows (one movement per line item, not zero, not double)

-- I5: refund reverses exactly what the sale did
select sale_id from sales where refunded_amount > total_paid
   or (select sum(refunded_qty) from sale_items where sale_id = sales.id)
      > (select sum(qty) from sale_items where sale_id = sales.id);
-- must return 0 rows

-- I6: online order stock effect is zero until converted
select id from store_orders where status != 'converted'
  and id in (select reference_id from stock_history where reference_type='store_order');
-- must return 0 rows
```

**Additional invariants (assert, don't just hope):**
- `UI total == stored sale total == payment movement sum == receipt total == report total` for every
  sale — spot-check with a script comparing `getEffectiveTotal(sale)` output against the raw payment sum.
- No two `stock_history`/`payment_movements` rows exist with the same `(reference_type, reference_id,
  movement_type/direction)` — the unique indexes in §4/§6 enforce this at the DB level, which is the
  only reliable enforcement (application-level checks alone are not sufficient under concurrency).

---

## §8. RETURNS / REFUNDS — ONE SERVICE, USED BY POS AND E-STORE

```
processRefund(saleId, itemsToRefund[]):
  1. load sale + all prior refund/return rows for this sale
  2. per line: remainingQty = soldQty − Σ previously refunded qty for that line
  3. remainingAmount = paidAmount − Σ previously refunded amount
  4. reject if requested > remaining (server-side, hard reject, not a UI-only limit)
  5. BEGIN TRANSACTION
       a. stock_history insert (RETURN_IN) only for physically-returned items
       b. payment_movements insert (OUT) on the ORIGINAL tender account(s), split proportionally if
          the original sale used split payment
       c. tax reversed proportionally: taxReversed = originalTax * (refundAmount / originalTotal)
       d. update sale.refunded_amount, sale_items.refunded_qty, sale.status
             ('refunded' | 'partially_refunded')
       e. reverse customer ledger by the refunded amount
     COMMIT
  6. idempotency: same refund request (same idempotency key, or "already fully refunded" check) → no-op
```
This exact function is used for POS refunds AND for online-order returns — no second implementation.
Full refund = same function with `itemsToRefund` = all remaining lines. Bill delete/void reuses this
reversal pattern but tags the sale `voided` for reporting clarity — historical row is never destroyed.

---

## §9. E-STORE ↔ POS BRIDGE — PRODUCTION HARDENING

Keep the existing correct principle (P1 above): **no stock effect at order placement.** This is
deliberate — it stops fake/bot/prank orders from locking real inventory before anyone pays or shows up.
Production hardening on top of that:

- **Rate limit** order placement per phone number / IP (e.g. max N orders per M minutes) — prevents
  queue-flooding even though stock isn't at risk.
- **No-show tracking**: flag customers with repeated cancelled/expired orders so staff see a warning
  before accepting a new one from them.
- **Auto-expire** `pending` orders after `settings.estoreOrderTimerMinutes` — keeps `/orders` queue
  clean, still zero stock effect.
- **Order state machine, enforced server-side** (not just UI-disabled buttons):
  `pending → accepted → preparing → ready → out_for_delivery → delivered`, or `→ cancelled` from
  pending/accepted. Invalid transitions rejected by the backend.
- **Three separate status fields**, never collapsed into one: `orderStatus`, `paymentStatus`
  (`unpaid|paid|refunded|partially_refunded`), `fulfillmentStatus` (`unfulfilled|packed|shipped|delivered`).
- **Cancel-during-checkout race**: before committing the POS sale for a loaded store order, re-check
  `store_orders.status` inside the same transaction (see §5.1) — a cancellation that happens mid-checkout
  must abort the sale, not silently bill a cancelled order.

---

## §10. PRICING/TAX — ONE FUNCTION, NO SECOND IMPLEMENTATION ANYWHERE

```
calculateCart(items, discounts, billDiscount, extraCharges, taxRate) → {
  subtotal, manualItemDiscountTotal, autoPromotionAmount, billDiscountAmount,
  totalDiscount, taxableBase, taxAmount, total, totalCost, isBelowCost
}
```
Order: **Line Total → Line Discount → Auto Promotions (M&M/%/fixed/free-gift) → Manual Bill Discount →
Taxable Extra/Service Charges (delivery etc.) → Tax → Final Total.** Tax base includes taxable
extraCharges — this is the exact bug that was already found and fixed once (P7); write a permanent
regression test asserting `POS extraCharge tax == E-store deliveryFee tax` for the same rate/amount so
this specific class of bug cannot silently return.

`extraCharge` objects carry `taxable: boolean` (default true) so a future non-taxable adjustment (tip,
waiver, manual correction) doesn't get incorrectly taxed by a blanket rule.

Rounding: one function (`roundTo2`, symmetric half-away-from-zero), used everywhere money is computed —
POS, E-store, receipts, reports, refunds. No `Math.round`/`toFixed` scattered elsewhere.

**Mix-and-match parity**: confirm whether E-store is *intended* to support M&M discounts. If yes, route
it through the same shared discount evaluator POS uses — no second implementation. If no, that's fine,
but it must be a documented decision, not a silent accidental gap.

---

## §11. BARCODE, PRODUCT IDENTITY, SETTINGS

- Barcode/SKU **unique at the DB level** (unique index) — two products can never silently share a code.
- Canonical identity is `productId` + `variantId` + `barcode/SKU` — never a display name.
- One barcode-lookup service used identically by: POS scan-to-sell, Inventory scan-to-stock-in,
  Transactions scan-to-find, and E-store product linking.
- Settings: one canonical source per key (`taxRate`, `currency`, `estoreDeliveryFee`,
  `estoreOrderTimerMinutes`, discount rules, cashier discount/refund limits). If the same key exists in
  more than one table/file/hardcoded constant today, consolidate to one, repoint every consumer
  (POS, E-store, receipts, reports), delete the stale copies.
- `settings.estoreEnabled=false` must hide `/store` and `/orders` **and** block direct URL access
  server-side — not just hide the nav link.

---

## §12. OFFLINE / SYNC / CONCURRENCY

- Local write succeeds immediately (offline-first, already correct per P13) → queued → cloud RPC commits
  exactly once via idempotency key → on reconnect, replay is safe because the unique indexes in §4/§6
  make a duplicate insert a no-op, not a double-post.
- Failed/conflicted sync operations get an explicit state (`pending|processing|success|retry|failed|
  conflict`) and are inspectable in an admin sync-status view — never silently dropped.
- **Mandatory race test**: two POS terminals sell the last unit of the same product simultaneously, and
  a third device loads/fulfills an online order for the same product, all at once. After settling,
  re-run §7's I1 query — must return 0 mismatch rows. If `allowNegativeStock=false`, exactly one of the
  concurrent attempts must succeed and the others must fail cleanly with a stock-unavailable error (DB
  transaction/row-lock enforced, not a frontend race that both "succeed" client-side).

---

## §13. FULL END-TO-END VERIFICATION RUN (must be executed on real/seeded data, not assumed)

```
Create Product + Barcode
→ Restock (creates supplier bill, referenceId-idempotent)
→ Pay Supplier (wallet OUT + supplier ledger paid, one transaction)
→ POS Sale, split cash+card → stock down exactly, both wallets up exactly
→ Partial Refund (one item) → stock partially restored, correct wallet(s) reversed, tax proportional
→ Expense recorded from cash → wallet down, expense row exists
→ Online Order placed → zero stock effect (verify via I1/I6 queries)
→ Admin Load-to-POS → cashier bills it → stock down exactly once, order marked converted
→ Two terminals attempt to load the same order simultaneously → only one converts (§5.1)
→ Online-originated sale refunded via the SAME RefundService → correct wallet reversed
→ Cashier role attempts /settings and unlimited refund via direct API → both rejected (§2.1)
→ Run all §7 invariant queries → every one returns 0 mismatch rows
→ Run Reports (Sales, Inventory, Financial, Supplier) → totals match the transactions above exactly
```
Every arrow must be checked against the **database state via query**, not the UI screen, before moving
to the next step.

---

## §14. AGENT EXECUTION ORDER (do in this order, do not skip)

```
1.  Fix §2 (permission system) in isolation, test it, confirm it, THEN proceed
2.  Full repo scan: find every direct stock/balance writer (§4.4), classify each
3.  Full RPC/schema inspection: commit_sale, apply_payment_movements, apply_stock_movements,
    delete_sale_atomic, refund_sale_atomic, get_next_invoice_number — document inputs/outputs/
    transaction boundary/idempotency for each
4.  Add missing unique indexes (§4, §6) — backup first, migration-safe, preserve existing data
5.  Refactor any rogue direct-writer into the ledger service
6.  Implement/verify reconciliation job (§4.3) and Reconciliation Dashboard
7.  Verify checkout atomicity + idempotency key (§5) — add if missing
8.  Verify/unify RefundService (§8) across POS and E-store — remove any duplicate implementation
9.  Verify E-store↔POS bridge hardening (§9) — rate limiting, state machine, race guard
10. Verify pricing engine is singular (§10) — remove any second tax/discount implementation found
11. Verify barcode uniqueness + settings single-source (§11)
12. Verify offline/sync idempotency and run the concurrency race test (§12)
13. Run the full §13 end-to-end scenario against real/seeded data
14. Run every §7 invariant query — must be 0 mismatch across the board
15. Run a SECOND full repo scan — a fix in one place often reveals another old path; repeat until clean
16. Produce the final report (§15)
```

---

## §15. REQUIRED FINAL REPORT FORMAT

```
A. FILES: inspected / created / modified / moved / deleted
B. DATABASE: tables changed, indexes added, constraints added, RPCs changed, migrations run,
              records migrated/repaired
C. CRITICAL FIXES: permission system status (§2) — PASS/FAIL with proof (test run output)
D. INVARIANTS (§7): I1–I6 — each PASS/FAIL with the actual query result, not a guess
E. END-TO-END (§13): each step — PASS/FAIL
F. REMAINING ISSUES: issue / root cause / impact / why not fixed / next action — never hidden,
   never rounded up to "100% fixed" while a real mismatch remains
```

**A "complete" declaration without §7's queries actually returning 0 rows, and without §2's permission
fix verified by a real rejected-API-call test, is not accepted.**
