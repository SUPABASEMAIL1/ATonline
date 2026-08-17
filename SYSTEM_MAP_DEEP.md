# 🔬 SYSTEM_MAP_DEEP.md — POS & E-STORE (ONLINE STORE) ULTRA-DEEP ANALYSIS

> **Scope:** ONLY the **POS system** and the **E-store / Online Store (`/store) system** of THIS project
> (`/Users/shoaib/Desktop/pos v12.2`). All claims are grounded in actual code (file:line cited).
> This is a deeper, verified companion to `SYSTEM_MAP.md` focusing on calculations, data flow, links,
> and cross-system consistency.

---

# 🟦 PART A — POS SYSTEM (ULTRA DEEP)

## A0. Entry & Routing
- Route `/pos` → `POSTerminal` (`src/App.tsx`).
- POS is the **single point of inventory truth**: a `Sale` is only created here, and only here is
  `product.stock` / `variant.stock` / addon stock deducted (see A3, A7).
- POS consumes global state from `useApp()` (`SupabaseAppContext`): `cart`, `salesTabs`, `selectedCustomer`,
  `billDiscount*`, `discounts`, `settings` (taxRate, currency), `products`.

## A1. POSTerminal (`src/components/pos/POSTerminal.tsx`)
- Renders: category rail → `ProductGrid` (left), `Cart` (right), bottom `SalesTabBar` / `SalesTabManager`.
- Holds the active **Sales Tab** system (`SalesTabManager`): multiple carts (Sale 1, Sale 2…) per device.
- Opens modals: `ProductOptionsModal` (variants/toppings/IMEI), `ComboSelectionModal` (deal slots),
  `DealSizeSelectorModal`, `DraftsModal` (hold/recall carts), `ShortcutsModal`, `CameraScanner`,
  `Promotion` (active discount picker), `RefundSaleModal`, `TransactionDetailModal`.
- Navigates to `CheckoutPage` (full-screen payment) carrying the active tab's cart.

## A2. Cart Calculations — `useCartCalculations` (`src/hooks/useCartCalculations.ts`)
This is the **authoritative pricing engine** for the bill. All rounding via `roundTo2` (symmetric
half-away-from-zero to kill float drift, lines 9-16).

**Step-by-step formula (lines 22-148):**

1. `manualItemDiscountTotal` = Σ `item.discount` (line discounts set in `ProductOptionsModal`/bundles).
2. `subtotalAfterItemDiscounts` = Σ `item.subtotal` (already net of line discount).
3. `subtotal` = `subtotalAfterItemDiscounts + manualItemDiscountTotal` (reconstructed gross, line 25).
4. **Auto discounts** (`discounts` list, eligible via `checkDiscountEligibility`):
   - `free_gift`: adds gift `CartItem` (subtotal 0) to `gifts[]`, no amount.
   - `mix_and_match`: unrolls eligible qty, sorts desc (best deal), computes sets =
     `floor(count / targetQuantity)`. Reward:
     - `fixed_total`: `bundleOriginalTotal − rewardValue`
     - `percentage_off_all`: `bundleOriginalTotal * rewardValue/100`
     - `cheapest_free`: cheapest unit price.  Uses **ORIGINAL (pre-line-discount) unit price** to stop
       line-discount + M&M stacking (B11, lines 66-100).
   - `percentage`: `(subtotalAfterItemDiscounts * value)/100`, capped at `maxDiscount` (B10: net base, not gross).
   - `fixed`: `value`.
   - Accumulates into `autoPromotionAmount`.
5. **Manual bill discount** (lines 140-142):
   - `percentage`: `subtotalAfterItemDiscounts * billDiscountValue/100`
   - `fixed`: `billDiscountValue`.
6. **Totals** (lines 145-148):
   - `totalDiscount` = `manualItemDiscountTotal + autoPromotionAmount + billDiscountAmount`
   - `taxAmount` = `roundTo2((subtotal − totalDiscount) * (taxRate/100))`  ← **tax is on NET, after discount**
   - `total` = `subtotal − totalDiscount + taxAmount`
7. **Profitability** (lines 151-161): `totalCost` = Σ `item.product.cost * qty` + gifts' cost (A6: gifts
   carry COGS so profit isn't overstated). `isBelowCost = total < totalCost`.

> **DELIVERY FEE NOTE:** delivery fee is an `extraCharge` added to the final `total` in `CheckoutPage`
> but is **NOT** part of `subtotal`, so it is **NOT taxed** in POS. (Contrast with E-store §B5.)

## A3. CheckoutPage (`src/components/pos/CheckoutPage.tsx`)
Full-screen payment: cash / card / split / credit. Builds the `Sale` object (lines 290-328) including
`appliedDiscounts`, `freeGifts`, `taxAmount`, `discountAmount`, `splitPayments`, `receivedAmount`,
`changeAmount`, `saleType`, `sourceOrderId` (set when fulfilling an e-store order).

**Sale creation + stock deduction (lines 332-411):**
- If `editingSaleId` (Bill Edit): **create NEW sale first (deducts stock), then delete OLD sale (restores
  stock)** in a two-phase atomic pattern (F4/F10). On delete failure it rolls back the new sale to prevent
  double-decrement (lines 343-372).
- Else: `salesService.create(sale)` (line 379) → stock deducted here.
- `adjustPaymentBalances(buildSalePaymentMoves(sale))` (line 380) updates wallet/payment ledgers.
- If `editingStoreOrderId`: marks the store order `status:'converted'`, `fulfilledSaleId` (lines 390-407)
  → this is the **only** bridge from an online order to a real sale.
- `refreshAffectedProducts()` reloads stock so UI/inventory reflect deduction immediately (line 409).
- `ADD_SALE` + `CLEAR_CART` + receipt.

## A4. SalesTabManager (`src/components/pos/SalesTabManager.tsx`)
- Multiple concurrent carts. `createTab` (lines 42-81) persists cart to `salesTabsService`.
- `closeTab` (lines 83-107): **FIXED (P2)** — now saves the live cart to the closing tab BEFORE switching
  active tab (previously discarded the cart).
- `switchTab` saves current cart before switching.

## A5. ProductGrid (`src/components/pos/ProductGrid.tsx`)
- Tap product → `ProductOptionsModal` (variants/modifiers/toppings/IMEI) → adds `CartItem`.
- `processBundleAdd` (lines 1063-1113): builds `effectiveBundle`, calls
  `bundlesService.getBundleCartItems(...)` → appends `bundleId`. Applies deal-level `toppingsMap` to first
  item. Sets `variantToSet` from bundle name (` - small/medium/large`) as `selectedVariant` label.

## A6. POS Modals — what each does (verified)
| Modal | Opens from | Writes / Does |
|---|---|---|
| `ProductOptionsModal` | ProductGrid tap | variants, toppings (addons), IMEI, line `discount`, `subtotal` |
| `ComboSelectionModal` | bundle with slots | slot selections → `getBundleCartItems` |
| `DealSizeSelectorModal` | deal size pick | tier selection (affects variant price) |
| `DraftsModal` | tab bar | save/recall/delete **drafts** (F13: drafts NEVER touch stock/revenue) |
| `ShortcutsModal` | keyboard `?` | hotkey list |
| `CameraScanner` | scan button | barcode scan → find product |
| `Promotion` modal | discount button | pick active `AppliedDiscount` |
| `RefundSaleModal` | Transactions / past sale | `refundSaleAtomic` (reverses stock + updates status, tax-proportional reversal) |
| `TransactionDetailModal` | sale row | read-only bill + actions (print/refund/edit) |
| `ReceiptPrint` / `ReceiptPreview` | after sale | printable receipt (uses `settings` receipt template) |
| `KOTPrint` | kitchen | kitchen ticket |
| `BarcodeGenerator` | product | sticker print |

## A7. Sale Persistence & Sync (`src/lib/services.ts`)
- `salesService.create` (line 1782): **DRAFT RULE (F13)** — pending drafts never touch stock/revenue
  (line 94). For a real sale it:
  - For each item: `newStock = product.stock − qty` (negative stock ALLOWED, never blocks — line 113),
    updates local `products.stock`, logs `stock_history` (line 168), pushes movement.
  - Variant stock via `variant_stock_history` trigger (lines 186-225).
  - Addon stock deducted (line 236+).
  - Builds `movements[]` and commits cloud via **`commitSaleAuthoritative`** (line 50) → Supabase RPC
    `commit_sale(p_sale, p_history)` (F3 dual-batch: local write + remote RPC in one tx).
- `commitSaleAuthoritative` (line 50): online-only RPC; returns null offline (safe — local already written,
  synced later by `syncEngine`).
- `revertLocalSaleStock` (line 73): undoes local stock if cloud reports the estore order already fulfilled
  by another device (race guard).
- `deleteSaleAtomic` (line 115) / `refundSaleAtomic` (line 142): idempotent cloud RPCs reversing stock.

## A8. POS Links to other systems
- **Inventory:** reads `products` (read-only selection); writes stock via `salesService.create`.
- **Customers:** `selectedCustomer` → `customerId` on sale; `totalPurchases` updated by Reports/customer logic.
- **Discounts:** `discounts` consumed by `useCartCalculations`.
- **Transactions:** completed sales appear; `RefundSaleModal` reverses.
- **E-store:** loads online order → cart (§B9) and bills it → real `Sale`.

---

# 🟩 PART B — E-STORE / ONLINE STORE (`/store`) ULTRA DEEP

## B0. Gating
- Entire store renders only if `settings.estoreEnabled` is true (`EStoreApp.tsx`).
- Route `/store` (StoreFront), `/store/checkout` (StoreCheckout), `/store/track` (OrderTracker).
- Admin side of the same orders lives at **`/orders`** → `OnlineOrdersPage` (`src/components/orders/OnlineOrdersPage.tsx`).

## B1. EStoreApp (`src/components/estore/EStoreApp.tsx`)
- Wrapper: pulls `products`, `categories`, `bundles`, `settings`; provides `useEstoreAuth` (customer session).
- Renders `StoreFront` + `StoreCheckout` (route-switched) + `OrderTracker`.

## B2. StoreFront (`src/components/estore/StoreFront.tsx`)
- Customer storefront: category list, product grid, cart drawer, past-orders modal.
- `addToCart(product, qty, {selectedVariant, selectedVariantId, selectedModifiers, toppings})` (line 218).
- Opens `StoreProductModal` (line 1079) and `StoreDealModal` (line 1092) for variants/combo.
- `handleOrderAgain` (line 287): **FIXED (E8)** — now passes `selectedVariantId` + `toppings` so reorder
  restores the exact configuration.
- Live `StoreOrderTimer` (lines 17-70): auto-expiry countdown per `settings.estoreOrderTimerMinutes`.
- Cart is held in EStoreApp state and passed to `StoreCheckout`.

## B3. StoreProductModal (`src/components/estore/StoreProductModal.tsx`)
- Customer-facing variant/toppping picker. Returns a `CartItem` with `selectedVariant`, `toppings`,
  `subtotal` = base/variant price × qty + toppings.

## B4. StoreDealModal (`src/components/estore/StoreDealModal.tsx`)
- Combo/fixed deal picker. **Pricing is variant-tier aware** (lines 88-131 use `getItemPrice` =
  `variantData[tier].priceOverride ?? product.price`).
- `handleAdd` (line 235): builds `effectiveItems` from slot selections (combo) or `bundle.items` (fixed),
  then `bundlesService.getBundleCartItems(effectiveBundle, products, useTier)` (line 256).
  - **E3 FIX:** `useTier` = selected size tier, **unless** `overridePrice` is set (fixed-price deals ignore
    tier so the advertised fixed price wins). Cart now matches the modal's displayed price exactly.
  - Attaches `selectedVariant` label; toppings merged into first item.
- Discount in modal (`dealPrice` = total − discount) and in cart now use the SAME variant-aware base.

## B5. StoreCheckout (`src/components/estore/StoreCheckout.tsx`)
- Collects name/phone/address, payment method, fulfillment (delivery/pickup), geolocation.
- **Totals formula (lines 195-198, edited for E6):**
  - `cartTotal` = Σ `item.subtotal`
  - `deliveryFee` = (delivery mode) ? `settings.estoreDeliveryFee` : 0
  - `taxRate` = `settings.taxRate || 0`
  - `taxAmount` = `round((cartTotal + deliveryFee) * taxRate/100)`  ← **tax base INCLUDES delivery fee**
  - `total` = `cartTotal + deliveryFee + taxAmount`
- On submit (line 220+): creates a `StoreOrder` (`status:'pending'`, `cashier:'ONLINE_STORE'`) via
  `toRemoteStoreOrder`. Invoice via `supabase.rpc('get_next_invoice_number')` (shared INV- sequence).
- **Does NOT create a Sale and does NOT deduct stock** (verified — no `commitSaleAuthoritative` /
  `recordStockIn` call in this file).

## B6. OrderTracker (`src/components/estore/OrderTracker.tsx`)
- Live status timeline (pending → preparing → out_for_delivery → delivered).
- Auto-deliver timer (`setupTimer`) advances status to `delivered` after a timeout.
- **FIXED (E5):** removed the leaked `setupTimer(data)` call inside `fetchOrder`; the timer is now owned
  by the effect (re-created on status change, cleared on unmount). Stale-closure auto-deliver of a
  cancelled order is no longer possible.
- **It only updates `store_orders.status` — it NEVER creates a Sale or touches stock** (cosmetic only).

## B7. OnlineOrdersPage (`src/components/orders/OnlineOrdersPage.tsx`) — ADMIN
- Tabs: Active / Past. Search, detail drawer, status actions.
- **"Load to POS"** (lines 330-405): the bridge to a real sale:
  1. `SET_EDITING_STORE_ORDER_ID(order.id)`
  2. Builds `cartItems` from `order.items`; injects **Delivery Fee** as a synthetic `isService` cart item
     if `order.deliveryFee > 0`.
  3. `SET_CART` + `SET_NOTES` (customer name/address/phone) + `UPDATE_SALES_TAB` (cart, customerId, notes).
  4. `navigate('/pos')`.
- Status transitions: pending→accepted→preparing→ready→out_for_delivery→delivered; `cancel` sets
  `cancelled` and clears `editingStoreOrderId` + cart (**E7 FIX**).
- Help tooltip (line ~390) explicitly states stock is untouched until the POS bill is finalized.

## B8. Customer Auth (`useEstoreAuth` / `loginOrRegister`)
- Customer login/register by name+phone (OTP-less). `StoreCheckout` calls `loginOrRegister` to upsert a
  `Customer` and use its `id` on the order.

## B9. E-STORE → POS BRIDGE (exact flow)
```
Customer places order (StoreCheckout)
   └─> store_orders row (status pending)  —— NO sale, NO stock change   [F24]
Admin: OnlineOrdersPage "Load to POS"
   └─> SET_EDITING_STORE_ORDER_ID + SET_CART(cartItems + delivery-fee item) + navigate('/pos')
Cashier bills at POS (CheckoutPage)
   └─> salesService.create(sale)  —— Sale created, stock DEDUCTED, tax computed
   └─> storeOrdersService.update(status:'converted', fulfilledSaleId)
```
This is the **only** path where an online order becomes inventory-affecting. Confirmed by code: no other
file calls `createSale`/`commitSaleAuthoritative`/`recordStockIn` on order placement.

## B10. Stock Rule Verification (F24)
✅ Verified: `StoreCheckout` and `OnlineOrdersPage` contain **zero** stock/sale mutations.
✅ `salesService.create` (the bill path) is the sole stock-deducting writer for sales.
✅ `OrderTracker` status change = cosmetic only.
→ Inventory can only move at the POS bill. Rule enforced in code.

---

# 🔗 PART C — CROSS-SYSTEM CONSISTENCY CHECK (POS vs E-STORE)

| Aspect | POS (`useCartCalculations` + CheckoutPage) | E-store (`StoreCheckout`/`StoreDealModal`) | Consistent? |
|---|---|---|---|
| Discount base | net of line discounts (`subtotalAfterItemDiscounts`) | modal uses same net base; cart via `getBundleCartItems` (variant-aware E3) | ✅ after E3 |
| Tax base | `(subtotal − totalDiscount) × rate` + **taxed extra/delivery charges** | `(cartTotal + deliveryFee) × rate` | ✅ after C1 fix |
| Tax rate source | `settings.taxRate` | `settings.taxRate` | ✅ |
| Variant pricing | `getBundleCartItems` now tier-aware | `getBundleCartItems(…, useTier)` tier-aware | ✅ after E3 |
| Stock change | at `salesService.create` only | none until POS bill | ✅ (F24) |
| Invoice numbers | `getNextInvoiceNumber` / atomic RPC | shared `get_next_invoice_number` RPC (INV- sequence) | ✅ |

### C1. Delivery-fee taxation — ROOT-CAUSE + FIX
**Root cause (verified, corrected):** The e-store→POS flow was actually ALREADY consistent — when an
online order is loaded to POS, its delivery fee becomes a `CartItem` (`isService`, `subtotal=deliveryFee`,
`OnlineOrdersPage.tsx:330-405`), so `useCartCalculations` includes it in `subtotal` and **taxes it**. The
real, isolated inconsistency was the **direct-POS manual delivery charge**: it is entered as an
`extraCharge` (local `useState` in `CheckoutPage`, NOT in `subtotal`), so it was added to `finalTotal`
but **excluded from the tax base** — under-taxed vs an e-store order.

**FIX applied (`CheckoutPage.tsx`):**
- `extraChargesTax = round(extraChargesTotal × taxRate/100)` (line ~129).
- `finalTax = taxAmount + extraChargesTax` is written to `sale.taxAmount` (line ~293).
- `finalTotal` now includes `extraChargesTax`, so the on-screen "Net Total" and the saved bill both
  reflect the taxed delivery fee — matching the e-store preview exactly.
- Result: delivery/service charges are now taxed identically in direct-POS and e-store paths. ✅

### C2. Things verified CORRECT
- Auto/manual/bill discounts, M&M, free-gift COGS — all net-of-discount and drift-free (B4/B10/B11).
- Bill-edit two-phase stock safety (F4/F10) in `CheckoutPage`.
- Draft isolation (F13): drafts never touch stock.
- Estore→POS bridge is the single inventory mutation point.

---

# 🧭 PART D — INTENDED SYSTEM DESIGN ("HOW IT SHOULD WORK")

> Goal: a **feature-proof** retail OS where inventory is NEVER wrong ("kam ziada" impossible), every
> money action is atomic & auditable, supplier payables stay SEPARATE from the cash/bank wallet, and
> returns/refunds/deletions are consistent across POS ↔ E-store ↔ Reports. Each section = **CURRENT
> (verified)** + **SHOULD-WORK guarantee**.

## D0. Core Principles (must hold everywhere)
1. **Single source of inventory truth** = the POS bill (`salesService.create`). No other path mutates stock.
2. **Every mutation is atomic** (local write + cloud RPC in one tx) → no partial states.
3. **Every financial write is guarded** (F21 stale-write, F12 single-reversal, tombstones).
4. **Supplier ledger ≠ payment wallet** (different tables, never merged).
5. **Offline-first**: local write always succeeds; cloud sync is a queued background concern.

## D1. INVENTORY LIFECYCLE (restock / adjust / sale / return / delete)
**CURRENT (verified):**
- **IN**: `commitStockInToInventory` (`src/lib/stockInCommit.ts`) → `purchaseRecordsService.create` (updates
  `product.stock`, last-cost, `stock_history`) + optional `suppliersService.recordBill` (supplier ledger only).
  Variant stock via F22 ledger. Idempotent bill via `referenceId` (X9 fix).
- **SALE OUT**: `salesService.create` (`services.ts:1782`) deducts `product.stock − qty` (negative allowed),
  logs `stock_history`, variant + addon stock; commits cloud via `commit_sale` RPC (F3 dual-batch).
- **RETURN IN**: `returnSale` (`services.ts:2397`) restores product/variant/addon stock (trackInventory-gated),
  logs `return` history, reverses tax proportionally (B2), updates `refundedAmount`/`status`, reverses
  customer `totalPurchases`, reverses wallet via `buildReversePaymentMoves`. Idempotent (mutex + already-refunded no-op).
- **DELETE (restore)**: `deleteSaleAtomic` (`services.ts:115`) reverses stock in one cloud tx.
- **ADJUST**: physical count / +/- adjustment — uses `type:'adjustment'`/`'adjustment_out'` stock_history.
- **DRAFT**: `salesService.create` DRAFT rule (F13) — never touches stock/revenue.
- **RECONCILE**: `reconcileAllStock` (F11) + audit tool to fix drift.

**SHOULD-WORK guarantee:**
- Stock after any sequence (restock → sale → return → adjust → delete) must equal the mathematically
  expected value. Enforced by: every +/- goes through `stock_history` (append-only), cloud `stock_history`
  trigger is the only cloud stock writer, local mirrors it. A daily **reconcile job** compares
  `Σ stock_history` vs `product.stock` and auto-flags/repairs drift (already exists as F11).
- **"Kam ziada" prevention**: no code path writes `product.stock` directly without a corresponding
  `stock_history` row; stale-write guard (F21) blocks cross-device overwrites.

## D2. RETURNS / REFUNDS / DELETIONS / BILL-EDIT (consistency)
**CURRENT (verified):**
- **Full refund**: `returnSale` restores stock + reverses tax + reverses wallet + updates customer. Status → `refunded`.
- **Partial refund**: per-item `refundedQuantity`; `finalStatus = partially_refunded` until all qty refunded;
  tax reversed by `taxRatio = refundAmount/total` (B2); wallet reversed by same ratio.
- **Delete bill**: `deleteSaleAtomic` restores stock; hard/soft handled by RPC.
- **Bill edit**: `CheckoutPage` two-phase (create new → delete old; rollback on failure, F4/F10).
- **Draft**: isolated (F13).
- **E-store cancel**: `OnlineOrdersPage` → status `cancelled`, 24h auto-delete (R1); no stock touch.

**SHOULD-WORK guarantee:**
- A refunded/partially-refunded sale must show **identical numbers** in Transactions, Reports, Dashboard,
  Customer history, and Supplier (if billed) — driven by ONE `getEffectiveTotal(sale)` (net of refunded portion).
  Currently: Dashboard & Customer now recompute live (X1/X3/X5 fixes); keep this as the single function.
- Re-running a refund must be a **no-op** (mutex + `already refunded` guard already present — keep).
- Delete must NEVER leave stock deducted; refund must NEVER leave stock reduced twice.

## D3. PAYMENTS & "REAL WALLET" (cash / card / online / bank)
**CURRENT (verified):**
- Wallets = `paymentModes` table, seeded cash/card/online/wallet on boot (`SupabaseAppContext.tsx:1134`).
- `adjustPaymentBalances` (`services.ts:1036`) updates each mode's `balance` locally + syncs via
  `apply_payment_movements` RPC (queued if offline).
- Sale: `buildSalePaymentMoves` (`services.ts:1065`) → +delta per method (split supported).
- Refund/Delete: `buildReversePaymentMoves` (`services.ts:1086`) → −delta per method (ratio for partial).

**SHOULD-WORK guarantee:**
- **Wallet = live drawer balancing.** Each mode (cash, card, online, **bank**) has an independent balance.
  Opening float + sales − refunds − expenses − manual-cuts = closing balance. A "Cash Drop / Payout"
  action writes a manual `payment_movements` row (signed) so the drawer always reconciles.
- **Expense cuts the wallet**: recording an expense should optionally deduct from a chosen mode (usually
  cash) so `wallet_balance − expenses = physical cash`. (Verify `ExpenseManager` links to `adjustPaymentBalances`.)
- **Manual lena-dena (owner drawings / loans)**: a dedicated "Manual Adjustment" entry on each wallet
  (signed delta + note + cashier) — fully audited, never silent.
- **Split / mixed tender**: each split leg hits its own mode balance (already supported).
- **Tax collected** is part of the cash/card total (not a separate wallet) — reported as a liability in Reports.

## D4. SUPPLIER LEDGER = SEPARATE "ALAG KHATA" (must NOT touch wallet)
**CURRENT (verified):**
- Supplier payables live in `supplierTransactions` (separate table). `getBalance` (`services.ts:2669`) =
  Σ credits − Σ payments/returns. `recordBill` (purchase in) and `recordPayment` (cash-out) only.
- X9 fix: `recordBill` idempotent per `referenceId` → no double bill for same stock-in.
- Supplier balance is NOT merged into `paymentModes` wallet. ✅ (correct separation)

**SHOULD-WORK guarantee:**
- Paying a supplier is a **cash/bank OUT** from the wallet AND a `supplierTransactions` payment IN — two
  linked entries, never one. The wallet drop and the supplier credit must be atomic (one RPC / one queue batch).
- Supplier "opening balance" seeds the ledger; loans/returns handled as distinct types (X4 fix aligned stats).
- A supplier bill created from a PO/stock-in must reference that record (`referenceId`) so it can't be
  billed twice (X9). Manual supplier bills also supported but clearly tagged `manual_bill`.

## D5. EXPENSES
**CURRENT:** `ExpenseManager` records kharcha; should link to wallet deduction (D3).
**SHOULD-WORK:** expense = wallet OUT (chosen mode) + an `expenses` row for reporting. Categorised
(e.g. rent, utilities, supplier-payment-via-expense should instead go through D4). Never silently
decremented.

## D6. SYNC / OFFLINE
**CURRENT (verified):** `syncEngine.ts` `queueOp` buffers ops; atomic RPCs `commit_sale`,
`apply_stock_movements`, `delete_sale_atomic`, `refund_sale_atomic` commit cloud; tombstones for soft-delete;
realtime subscriptions; F18 conflict guards; F21 stale-write guard.
**SHOULD-WORK:** offline sale → local stock updated immediately + queued; on reconnect, exactly-once
delivery (idempotency keys). No op lost, no double-apply. Draft/refund/delete all survive offline.

## D7. USERS / PERMISSIONS (salesman / cashier / admin) — ⚠️ CURRENTLY BROKEN
**CURRENT (verified — GAP):** Role logic is **REMOVED**. `AuthContext.tsx:626-627` forces every account to
`role:'cashier'`. `RequireAccess` (`App.tsx:95`) is a **no-op** (returns `<>{children}</>`), so every route
(including `/users`, `/settings`, `/suppliers`) is open to everyone. No permission matrix exists.
**SHOULD-WORK:**
- Three roles: **Admin** (full: settings, users, suppliers, delete/refund any bill, view all reports),
  **Cashier** (sell, refund own/within-limit, no settings/users/supplier edit), **Salesman** (can be tagged
  on a sale via `salesmanId` for commission; limited UI).
- `RequireAccess(viewId)` must actually check `profile.role` against a permission map and redirect/disable.
- Every financial action logs `cashierName`/`overrideBy` (already partly done) for audit.
- "No admin role" was a deliberate single-tenant simplification — but a real permission layer is needed
  before multi-staff shops. **This is the #1 missing feature for "system theek hona chahiye".**

## D8. BARCODES
**CURRENT:** `src/utils/barcode.ts` (Code-128), `CameraScanner` in POS scans → finds product by barcode;
`BarcodeGenerator` modal prints stickers; product has `barcode` field; `DatabaseTools` bulk export.
**SHOULD-WORK:** scan-to-sell (POS), scan-to-stock-in (Inventory), scan-to-find (Transactions). Barcode
unique per product/variant; printing from product detail & bulk from Inventory. E-store products also
carry scannable SKU.

## D9. SETTINGS ↔ POS ↔ ONLINE STORE RELATIONS
**CURRENT (verified):**
- Settings tabs: `general`, `receipt`, `backup`, `security`, `database`, `estore` (+ `backup` now renders
  `DatabaseTools`, X8 fix). `estoreEnabled` gates the whole `/store` + `/orders`.
- POS reads `settings.taxRate`, `currency`, `receipt*`; E-store reads same `taxRate`, `estoreDeliveryFee`,
  `estoreOrderTimer*`.
- Online ordering: `StoreFront` → `StoreCheckout` (order) → `OnlineOrdersPage` "Load to POS" → bill (D-bridge, B9).

**SHOULD-WORK:**
- One settings object = single source for tax/currency/receipt/store; changing it updates POS + E-store
  instantly (already via `useApp().state.settings`).
- E-store "ordering system" = browse → cart → checkout → admin fulfils at POS (F24: no stock until bill).
- `backup` tab = full DB backup/restore (DatabaseTools); `database` = advanced (sync, raw). Keep distinct.

## D10. REPORTING (all numbers must agree)
**CURRENT (verified):** `ReportsManager` sub-tabs (Sales, Inventory, Financial, Supplier…); `getEffectiveTotal`
net of refund; Dashboard recomputes from `state.sales` + `supplierTransactions` (X1/X5). FinancialReport
"Net Profit" = revenue − COGS − expenses (X6 fix).
**SHOULD-WORK:** Every report (Dashboard, Reports, Transactions, Customer, Supplier, Financial) derives from
the SAME primitives (`getEffectiveTotal`, `getBalance`, `paymentModes` balances). No report should disagree
with another by even a cent — enforced by shared calculators, not per-page ad-hoc sums.

## D11. CROSS-SYSTEM INVARIANTS (the "kam ziada" guarantee)
1. `product.stock` == `opening + Σ stock_history(positive) − Σ stock_history(negative)` always.
2. `paymentModes[mode].balance` == `Σ payment_movements(delta)` for that mode always.
3. `supplier balance` == `Σ supplierTransactions` always (separate from #2).
4. `Sale` exists ⟺ stock was deducted exactly once (F3/F24).
5. Refund/delete reverses exactly what the sale did (stock + wallet + tax + customer).
6. E-store order stock effect == 0 until POS bill.

> These invariants are the acceptance test for "system theek hai". A nightly reconciliation (F11) should
> assert all six and alert on violation.

---
*Generated from direct source reads. File:line references point to the current working tree of
`/Users/shoaib/Desktop/pos v12.2`.*
