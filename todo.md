# E-Store Global Disabling & Billing Flow Checklist

- [x] Hide E-Store Online Orders navigation tab in Header when disabled (`state.settings.estoreEnabled` is false).
- [x] Hide "STORE SORT" tab in Inventory Manager when disabled (`state.settings.estoreEnabled` is false).
- [x] Block access to `/online-orders` route in `App.tsx` by redirecting to `/pos` when disabled.
- [x] Display a premium, rich-aesthetic "Store is closed" fallback screen on storefront `/store` when disabled.
- [x] Verify inventory is not deducted on E-Store order placement (remains untouched as `status: 'pending'`).
- [x] Enforce that billing is done through POS Checkout, where stock, batches, and FIFO cost details are atomically updated.
- [x] Preserve E-Store metadata (`deliveryAddress`, `deliveryLocationLat`, `deliveryLocationLng`, `customerNotes`) and set `estoreStatus` to `out_for_delivery` upon POS checkout inside `CheckoutPage.tsx`.
- [x] Prevent E-Store order timer from auto-marking orders as `delivered` (which bypassed billing and locked them without stock deduction).
- [x] Verify TypeScript compile success (`npx tsc --noEmit`).

# Inventory Integrity & Product Edit Fixes
- [x] Fixed "Quick Controls" cost and price updates in `ProductDetailHub.tsx` to automatically synchronize changes to `products.batches[]` in both Dexie and React Context, preventing stale FIFO costs.
- [x] Fixed "Commit Changes" product edit handler in `ProductDetailHub.tsx` to update active batches' `costPrice`/`salePrice` in the `product_batches` table, in `products.batches[]` array, and queue sync when prices/costs are modified.
- [x] Fixed inventory tracking enablement bug where enabling tracking on an existing product created the stock history entry but failed to insert the initial batch into the `product_batches` table.
