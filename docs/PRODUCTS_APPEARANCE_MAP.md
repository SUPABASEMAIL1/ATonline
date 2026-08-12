# 🗺️ PRODUCTS APPEARANCE MAP — Complete List of Every Place Products Are Displayed

> **Purpose:** Master reference of ALL locations across the app where products are rendered. Use this before making any product-related fix (name, price, image, stock, variant, bundle display) to ensure the fix is applied EVERYWHERE.
>
> **Last scanned:** Aug 2026 — 30 locations across 24 files.

---

## 🔴 POS (In-House Terminal)

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 1 | **Product Grid** (main screen, search + grid) | `src/components/pos/ProductGrid.tsx` | 180 (search), 382-389 (cart merge check), 503/583 (card render), 1081-1113 (toppings mapping), 1204 (display name) |
| 2 | **Cart drawer** (item rows, bundles, gift lines) | `src/components/pos/Cart.tsx` | 47-168 (price calc), 546-567 (bundle totals), 672/692 (item rows), 766 (FREE gift), 1023-1049 (price edit), 1069-1081 (item card), 1140-1202 (price/cost display) |
| 3 | **Checkout Modal** (payment + item list) | `src/components/pos/CheckoutModal.tsx` | 68 (bundle hide prices), 547-661 (bundle + item rows), 707 (item count) |
| 4 | **Checkout Page** (full checkout view) | `src/components/pos/CheckoutPage.tsx` | 56-66 (cart items), 775-902 (item rows + bundles + modifiers/addons/toppings/SN), 923-948 (bundle thumb) |
| 5 | **Receipt Print** (live — A4 + 80mm + 58mm, all templates) | `src/components/pos/ReceiptPrint.tsx` | 77-102 (paper size + font), 436 (item summary), 549-766 (A4/80mm items + bundle children), 969 (table row), 1419-1527 (2nd layout block) |
| 6 | **KOT Print** (80mm kitchen ticket) | `src/components/pos/KOTPrint.tsx` | 114 (child key), 184 (child rows), 199 (item rows) |
| 7 | **Product Options Modal** (variants/modifiers/addons/serial) | `src/components/pos/ProductOptionsModal.tsx` | 199 (title), 228 (child name) |
| 8 | **Combo/Deal Selection Modal** (POS) | `src/components/pos/ComboSelectionModal.tsx` | 102 (summary), 219-231 (option cards) |
| 9 | **Sales Tab** (cart drafts tab bar) | `src/components/pos/SalesTabManager.tsx` | 139 (item count badge) |

---

## 🛍️ Online Store (estore)

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 10 | **Store product grid** (storefront cards) | `src/components/estore/StoreFront.tsx` | 292-329 (price/variants logic), 333-371 (card render), 417 (search), 707-709 (deal preview) |
| 11 | **Store cart drawer** | `src/components/estore/StoreFront.tsx` | 951-998 (item rows) |
| 12 | **Store checkout** (items + bundles) | `src/components/estore/StoreCheckout.tsx` | 601-738 (bundle + item rows, modifiers/addons/toppings) |
| 13 | **Product detail modal** | `src/components/estore/StoreProductModal.tsx` | 28-75 (variants/price logic), 110-145 (render) |
| 14 | **Deal modal** (bundle customization) | `src/components/estore/StoreDealModal.tsx` | 204 (summary), 267-287 (price calc), 336-338 (hero), 472-490 (option cards), 556-573 (children) |
| 15 | **Order tracker** (customer view) | `src/components/estore/OrderTracker.tsx` | 182-225 (item rows + variants/modifiers/addons) |
| 16 | **Cart state / add-to-cart logic** (estore) | `src/components/estore/EStoreApp.tsx` | 73-79 (migration), 240-337 (add/qty/price logic) |

---

## 📋 Orders & Sales (Admin side)

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 17 | **Online orders** (order detail items) | `src/components/orders/OnlineOrdersPage.tsx` | 631-747 (bundle + item rows, variants/addons) |
| 18 | **Transaction detail modal** (sale items) | `src/components/transactions/TransactionDetailModal.tsx` | 175-195 (price logic), 435-501 (item rows, click → product detail) |
| 19 | **Refund sale modal** | `src/components/transactions/RefundSaleModal.tsx` | 43 (productId), 114 (item render) |
| 20 | **Sales reprint** (from transactions list) | `src/components/transactions/TransactionsManager.tsx` | 402-410 (item summary/cost), 843 (ReceiptPrint mount) |

---

## ⚙️ Settings

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 21 | **Receipt preview** (receipt designer) | `src/components/settings/ReceiptPreview.tsx` | 240 (sample items), 331-337 (items table), 389-393 (A4 table rows) |

---

## 📦 Inventory

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 22 | **Inventory list** | `src/components/inventory/InventoryManager.tsx` | 180 (search), 1152 (ReceiptPrint mount) |
| 23 | **Product detail hub** (add/edit form) | `src/components/inventory/ProductDetailHub.tsx` | 52-107 (form state) |
| 24 | **Bundle manager** (deal builder) | `src/components/inventory/BundleManager.tsx` | 1049-1053, 1448-1645 (item renders) |
| 25 | **Inventory report** (stock value, profit) | `src/components/inventory/InventoryReportManager.tsx` | 96-207 (rows) |
| 26 | **Purchase order system** (PO builder) | `src/components/inventory/PurchaseOrderSystem.tsx` | 176-290 (product picker + lines) |
| 27 | **Purchase history** (stock-in) | `src/components/inventory/PurchaseHistory.tsx` | 71-385 (picker, stock update, records) |
| 28 | **Batch stock-in** | `src/components/inventory/BatchStockInSystem.tsx` | 62-79 (picker + defaults) |
| 29 | **Store sort** (estore ordering) | `src/components/inventory/StoreSort.tsx` | 408-453 (sort rows, visibility toggle) |
| 30 | **Barcode generator** | `src/components/inventory/BarcodeGenerator.tsx` | whole file (A4/80mm sheets) |
| 31 | **Media library** (product images) | `src/components/inventory/MediaLibrary.tsx` | 109 (product name list) |

---

## 📊 Reports & Other

| # | Place | File | Key Lines |
|---|-------|------|-----------|
| 32 | **Reports** (sales by product, inventory, suppliers) | `src/components/reports/ReportsManager.tsx` | 369-1006 (product/category/supplier logic) |
| 33 | **Discount modal** (product picker) | `src/components/discounts/DiscountModal.tsx` | 43-518 (picker + conditions) |
| 34 | **Mix & match builder** | `src/components/discounts/MixAndMatchBuilder.tsx` | 47-139 (picker) |
| 35 | **Dashboard** (low stock) | `src/components/dashboard/DashboardManager.tsx` | 145 (low stock count) |

---

## ✅ Checklist Before Any Product Fix

- [ ] POS: ProductGrid, Cart, CheckoutModal, CheckoutPage, ReceiptPrint (A4 **and** 80mm/58mm), KOTPrint
- [ ] Store: StoreFront grid + cart, StoreCheckout, StoreProductModal, StoreDealModal, OrderTracker
- [ ] Admin: OnlineOrdersPage, TransactionDetailModal, RefundSaleModal, TransactionsManager reprint
- [ ] Settings: ReceiptPreview
- [ ] Inventory: InventoryManager, ProductDetailHub, BundleManager, reports, purchases, StoreSort, Barcode
- [ ] Others: ReportsManager, DiscountModal, MixAndMatchBuilder, DashboardManager

## ⚠️ Known Inconsistencies (common fix points)

| Issue | Locations affected |
|-------|--------------------|
| Missing `?.` fallback on `item.product?.name` — shows "Item" or crashes | OnlineOrdersPage, TransactionDetailModal, ReceiptPrint (uses `|| 'Item'`, needs `?.`) |
| Bundle child formatting differs | CheckoutModal vs CheckoutPage vs StoreCheckout vs OnlineOrdersPage |
| A4 vs 80mm layout differences in ReceiptPrint | ReceiptPrint lines 549-766 vs 1419-1527 |
| ReceiptPreview sample items may drift from ReceiptPrint layout | ReceiptPreview vs ReceiptPrint |
| Estore cart empty/legacy item migration (`productId` vs `item.product`) | EStoreApp.tsx:73-79, StoreFront.tsx:292-294 |