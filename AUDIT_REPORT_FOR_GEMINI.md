# PROMPT FOR GEMINI (Antigravity) — POS v12.2 REAL AUDIT + FIX LIST

You are working on a React + TypeScript + Supabase POS system (multi-shop, offline-first, IndexedDB local cache synced to Supabase). The owner is frustrated: "this POS keeps running into problems, I'm humiliated fixing issues repeatedly." Below is a REAL, evidence-based audit (file:line verified). Your job: implement the fixes so the system is clean with 0 issues, no data leakage, no wrong numbers. Follow existing architecture (src/lib/services.ts, src/lib/syncEngine.ts, src/context/SupabaseAppContext.tsx). NO Prisma/direct DB — use Supabase Management API for schema. Keep code universal (no shop hardcoding). After changes: npm run build must pass, then push to all 4 remotes (origin/atonline/minimahalpos/pizzamilano).

## VERIFIED ROOT CAUSES (real bugs)

### 1. INVOICE SERIAL — duplicates / gaps / resets (CRITICAL)
- `src/lib/services.ts:83-93` `getNextInvoiceNumber`/`generateNextInvoiceNumber` use pure `settings.invoiceCounter + 1` client-side. No atomicity, no `max(existing)+1`. Two devices/tabs emit same number.
- `src/context/SupabaseAppContext.tsx:2193-2211` `useInvoiceGeneration` calls `settingsService.update({invoiceCounter})` WITHOUT await, error swallowed → cloud counter lags.
- `src/lib/syncEngine.ts:419-420` collision handler does `supabase.rpc('get_next_invoice_number')` then checks `data?.invoiceNumber`, but the RPC `RETURNS TEXT` (scalar) at `supabase/schema/SUPER_MASTER_SCHEMA.sql:1255`, so `data?.invoiceNumber` is undefined → recovery NEVER runs; falls through to `return` at line 439, removing the failed sale from queue (duplicate stays local).
- `src/context/SupabaseAppContext.tsx:1703-1718` startup handshake overwrites local counter with cloud when pendingOps empty → stale/lower cloud value resets numbering.
- `src/types/index.ts:426` default `invoice_counter: 1000`; if cloud row has null → reset to 1000.
- `src/components/estore/StoreCheckout.tsx:261` uses separate `WEB-${date}-${random}` scheme, later billed in POS with new `INV-` → orphaned mixed numbering.

### 2. INVENTORY REPORT INACCURATE + STOCK LEAK (CRITICAL)
- `src/components/inventory/InventoryReportManager.tsx:117,195,238` reads stock from React memory `state.products`/`state.sales`, NOT DB-direct (violates F6).
- `src/components/pos/CheckoutModal.tsx:290,354` after sale only dispatches ADD_SALE, never UPDATE_PRODUCT → in-session report shows pre-sale stock.
- `src/lib/services.ts:1748-1750` `salesService.delete` only restores stock if status `completed||credit`; `partially_refunded` sales skip reversal → permanent stock leak.
- `src/lib/services.ts:3941-3944` + `src/lib/syncEngine.ts:933` `reconcileAllStock(true)` runs every startup, force-overwrites LOCAL product.stock from cloud ledger → erases unsynced offline deductions.
- `src/lib/services.ts:3889-3903` reconcile loop only covers products, NOT variant_data[].stock.
- `src/components/inventory/BatchStockInSystem.tsx:128` resets stock to 0 via `productsService.update` which strips stock (`services.ts:1001` `delete remotePayload.stock`) → cloud/local divergence, no history written.

### 3. CHECKOUT MATH (split/credit) (HIGH)
- `src/components/pos/CheckoutPage.tsx:53` passes literal `paymentMethod` ('split') to `useCartCalculations`; `checkDiscountEligibility` (`src/context/SupabaseAppContext.tsx:2176`) strict-compares → card/digital discounts vanish on Split. Modal (`CheckoutModal.tsx:65`) passes 'cash' (correct). Two paths give different totals.
- `src/components/pos/CheckoutPage.tsx:289-290` credit sale sets `receivedAmount: undefined` → customer debt overstated (`creditUsed` uses full total).
- `src/hooks/useCartCalculations.ts:9-11` `roundTo2` is not true half-up → tax can be 0.01 off.
- `src/components/pos/ReceiptPrint.tsx` never renders `refundedAmount`/net → audit gap on refunds.
- `CheckoutPage.tsx:63` `extraChargesTotal` not rounded before adding to finalTotal.

### 4. BARCODE "breaks from settings" (HIGH — owner's exact complaint)
- `src/utils/barcode.ts:56-57` generates `PR` + random 4 digits → collides with UNIQUE index `idx_products_barcode_value` (`SUPER_MASTER_SCHEMA.sql:1015`) → product cloud sync fails, stays local-only.
- `src/components/settings/DatabaseTools.tsx:352` bulk import writes via `localDb.put` NOT `productsService.create` → no barcode assigned.
- `src/components/settings/DatabaseTools.tsx:569-583` barcode seeding is MANUAL only; no auto-seed on app load.
- `src/components/inventory/BarcodeGenerator.tsx:201,406` `barcodeType` QR toggle prints QR → 1D laser POS scanners can't read → labels unscannable (this is the "settings se kharab" complaint).
- OCR normalization inconsistent: POSTerminal maps O→0,I→1,L→1,S→5,Z→2; InventoryManager/ProductGrid/PurchaseOrderSystem map only O→0 → same barcode scans but not searchable.
- `src/components/settings/ReceiptPreview.tsx:212,323,383,443,564` receipt barcode hardcoded `INV-001234` (fake, identical on all receipts).
- `src/lib/services.ts:3040-3060` `seedMissingBarcodes` itself can collide on unique index silently.

### 5. SCHEMA GAPS (MEDIUM)
- `store_orders` missing `update_store_orders_updated_at` trigger (other 7 F21 tables have it) — `SUPER_MASTER_SCHEMA.sql` has 0 occurrences.
- `supabase/schema/SUPER_MASTER_SCHEMA.sql` is a duplicated concatenated file (block-1 5-type vs block-2 7-type variant CHECK) — divergence risk; should be single canonical + ALTER block.
- `src/lib/services.ts:2869` local VariantStockHistory.type union narrower than `types/index.ts:164`.

## WHAT WORKS (DO NOT BREAK)
F21 guards (8 tables), F22 variant ledger, F12 purchase single-reversal, F13 draft rule, F14 no-truncation, F7 shift removed, F8 settings singleton, core tax math in useCartCalculations. Drafts already use DRAFT- prefix and don't consume numbers — keep.

## ACTIONS

### REMOVE
1. Client-side `counter+1` invoice gen → replace with server atomic.
2. `syncEngine.ts:420` dead `data?.invoiceNumber` check.
3. Stale-cloud counter overwrite at `SupabaseAppContext.tsx:1703` (use Math.max reconcile).
4. Random barcode `PR+random` in `utils/barcode.ts`.
5. Manual-only seed; make auto-seed.
6. Hardcoded `INV-001234` receipt barcode.
7. Inconsistent per-file OCR → single shared helper.
8. Memory-read inventory report.

### FIX
1. Server-side atomic `next_invoice_number()` (DB function, row lock UPDATE invoice_counter+1 RETURNING) + migration; salesService.create calls it; on collision syncEngine reads scalar `data` and retries; after renumber also update local settings.invoiceCounter.
2. Startup: reconcile local vs cloud counter with `Math.max(local, cloud, maxStoredInvoice)`.
3. `services.ts:1749` restore stock for `partially_refunded` using un-refunded qty.
4. `syncEngine.ts:933` skip local overwrite if product has pending/unsynced stock_history ops.
5. `CheckoutPage.tsx:53` treat Split discounts as cash (or union per-method).
6. `CheckoutPage.tsx:289` store receivedAmount for credit.
7. true half-up round + round extraChargesTotal.
8. Receipt: show refundedAmount + net + tax/NTN field.
9. `services.ts:3889` add variant reconciliation.
10. Add `update_store_orders_updated_at` trigger + migration.
11. Dedup SUPER_MASTER_SCHEMA.sql.

### ADD
1. Atomic invoice DB function + migration (NOT NULL DEFAULT 1000 on invoice_counter).
2. Auto-barcode seed on app load + route bulk import through productsService.create.
3. DB-direct inventory report (auto accurate, no reload needed).
4. Product refresh after sale in checkout.
5. Unified estore numbering (no WEB-/INV- mix).
6. Shared OCR normalize helper used everywhere.
7. BarcodeType guard: printed labels always 1D CODE128 (QR labeled camera-only).
8. Real invoice number in receipt barcode.

## CONSTRAINTS
- Universal code, no shop name hardcoded (use settings.storeName).
- Keep drafts out of revenue/stock.
- After all fixes: npm run build, then git push origin main && git push atonline main && git push minimahalpos main && git push pizzamilano main.
- Update docs/MODULES.md + docs/UI_RULES.md + GEMINI.md SCHEMA CHANGE LOG if schema changes.
