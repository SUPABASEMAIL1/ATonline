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

# PWA Installers & Storefront Beep Sound Fixes
- [x] Fixed storefront `/store` beep sound bug: Disabled route transition sound effects (`playPageSound()`) and incoming online order alerts (`playOnlineOrderSound()`) for users visiting storefront routes.
- [x] Created 2 separate, physically distinct PWA web manifest files in the `public/` folder to prevent conflict and allow side-by-side installations:
  - POS/Staff App manifest: `/site.webmanifest` (scope: `/`, start_url: `/pos`, name: "Zaynahs POS System").
  - Customer Storefront manifest: `/store.webmanifest` (scope: `/store`, start_url: `/store`, name: "Zaynahs Online Store").
- [x] Deployed dynamic client-side manifestation routing to point browser `<link rel="manifest">` tags to `/store.webmanifest` or `/site.webmanifest` depending on pathname route.
- [x] Dynamically set browser tab favicon, Apple Touch Icon (`apple-touch-icon`), and title meta tags (`apple-mobile-web-app-title` / `application-name`) based on settings' saved business name and uploaded logo so that iOS Safari Add to Home Screen prompts generate dynamic customized names and icons without manifest network fetching errors.

# Icon Customization & Mobile Layout Fixes
- [x] Replaced the `ShoppingCart` icon with the `Bell` icon for the "Orders" navigation item in `Header.tsx` so that it is clearly distinct from the "POS" tab icon.
- [x] Optimized the POS Orders button on mobile: Hid the text label (`Orders`) and resized it to a perfect circle size (`w-7 h-7`) to match the adjacent keyboard shortcut button height (28px), and adjusted badge offsets to prevent overlap clipping.

# Media Library Integration
- [x] Deployed the centralized `MediaLibrary` component in `UserModal.tsx` for visual tokens (avatars), completing Rule 14 compliance across all image upload points (products, settings logos, deal banners, and user/operator avatars) with automatic size compression and library cataloging.

# Skeleton Loading Screens
- [x] Created a shared, reusable, state-of-the-art `<SkeletonLoader />` component (`src/components/common/SkeletonLoader.tsx`) with pre-designed premium shimmer loads for storefronts, card grids, list tables, and detail screens.
- [x] Replaced the generic loading spinners in `App.tsx` (auth load), `EStoreApp.tsx` (storefront load), `ProductGrid.tsx` (product loading safety checks), and `InventoryManager.tsx` / `ReportsManager.tsx` with the new shimmering `SkeletonLoader` layouts.
- [x] Formulated and appended the Skeleton Loading directive as rule 15 in `AGENTS.md` and rule 10 in `GEMINI.md` to ensure future loaders remain aesthetic and standardized.

# Alert Spawns & Mobile Optimization Fixes
- [x] Fixed countdown alert loop bug: Updated `OrderTimer` components in both `OnlineOrdersPage.tsx` and `StoreFront.tsx` to initialize alert/expired states immediately on mount, preventing toast notifications from spawning repeatedly when mounting or switching tabs.
- [x] Removed automatic DB update to `delivered` in storefront order timer expiration (`StoreFront.tsx`), aligning it with POS.
- [x] Mobile-optimized all E-store modals, drawers, and popups according to Rule 9:
  - Centered Cart Drawer on mobile (`items-center justify-center p-4 rounded-[2rem]`) while maintaining side drawer structure on desktop (`md:justify-end md:items-stretch md:p-0`).
  - Centered Orders History Modal on mobile (`items-center justify-center p-4 rounded-3xl`).
  - Centered `StoreProductModal` on mobile (`items-center justify-center p-4 rounded-[2rem]`).
  - Centered `StoreDealModal` on mobile (`items-center justify-center p-4 rounded-[2rem]`).
