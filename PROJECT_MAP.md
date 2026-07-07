# 🏪 POS System — Complete Project Map

> Generated: 2026-07-07  
> Source: Full codebase scan  
> Coverage: Every component, route, flow, data dependency

---

## TREE STRUCTURE

```
PROJECT ROOT (src/)
│
├── App.tsx                        ← Router (custom view-switcher, no React Router)
│   ├── LoginPage                  ← /login
│   └── ResetPasswordPage          ← /reset-password
│
├── LAYOUT
│   ├── Header                     ← Top nav bar (all view tabs)
│   ├── MobileBottomNav            ← Bottom nav (mobile only)
│   ├── SyncStatusBadge            ← Sync indicator pill
│   ├── SyncQueueManager           ← Pending sync operations modal
│   ├── OfflineBanner              ← Offline warning banner
│   ├── Toaster (sonner)           ← Global toast notifications
│   └── DialogProvider             ← Global confirm/alert/input dialogs
│
├── POS (Point of Sale)            ← Route: 'pos'
│   ├── POSTerminal                ← Main POS screen (orchestrator)
│   │   ├── SalesTabManager        ← Multi-tab cart (max 3)
│   │   ├── GridDensityController  ← Column count (auto/1-8)
│   │   ├── ProductGrid            ← Catalog grid + search
│   │   │   ├── ProductCard        ← Single product card
│   │   │   ├── BundleGrid         ← Bundle deal cards
│   │   │   └── CameraScanner      ← Barcode scanner
│   │   ├── Cart                   ← Cart sidebar/drawer
│   │   │   ├── CartItemCard       ← Single cart line item
│   │   │   ├── CustomerDetailModal
│   │   │   └── Modal
│   │   ├── CheckoutPage           ← Full settlement page
│   │   │   ├── ReceiptPrint       ← Receipt + print + share
│   │   │   └── ShortcutsModal     ← Keyboard shortcuts guide
│   │   ├── CheckoutModal          ← (Legacy) settlement modal
│   │   │   └── ReceiptPrint
│   │   ├── DraftsModal            ← Draft sales archive
│   │   ├── ProductOptionsModal    ← Variants/modifiers/serial picker
│   │   └── ShortcutsModal         ← Keyboard shortcuts
│   └── SyncQueueModal             ← POS-specific sync queue
│
├── DASHBOARD                      ← Route: 'dashboard'
│   └── DashboardManager           ← Home screen: stats, wallet, chart, quick actions
│       └── MagicalClock           ← Animated clock widget
│
├── TRANSACTIONS / SALES           ← Route: 'transactions'
│   └── TransactionsManager        ← Sales history: list, search, filter, edit, delete, refund, print
│       ├── CheckoutModal          ← Bill edit mode
│       └── ReceiptPrint           ← Reprint receipt
│
├── PRODUCTS (INVENTORY)           ← Route: 'inventory'
│   ├── InventoryManager           ← Main inventory page (tab orchestrator)
│   │   ├── ProductModal           ← Create/edit product (modal)
│   │   ├── ProductDetailHub       ← Product detail + edit (full-page)
│   │   │   ├── BatchStockInSystem
│   │   │   └── MediaLibrary
│   │   ├── BarcodeGenerator       ← Barcode/QR label printer
│   │   ├── BulkEditModal          ← Bulk product update
│   │   ├── PurchaseHistory        ← Stock-in records tab
│   │   │   └── BatchStockInSystem
│   │   ├── AuditTimeline          ← Unified audit timeline tab
│   │   ├── PurchaseOrderSystem    ← Auto/manual PO tab
│   │   ├── BundleManager          ← Bundle/deal CRUD tab
│   │   └── MediaLibrary           ← Image gallery tab
│   └── CAMERA SCANNER             ← Shared barcode scanner
│
├── STOCK / INVENTORY (shared with Products)
│   ├── BatchStockInSystem         ← Bulk stock-in modal
│   ├── ActionHistory              ← Stock action history viewer
│   ├── AuditTimeline              ← Unified audit timeline
│   └── PurchaseOrderSystem        ← Auto/manual PO generation
│
├── SUPPLIERS                      ← Route: 'suppliers'
│   ├── SupplierManager            ← Supplier list
│   │   ├── SupplierModal          ← Create/edit supplier
│   │   └── SupplierLedger         ← Per-supplier ledger
│   └── PurchaseOrderSystem        ← (also in inventory)
│
├── CUSTOMERS                      ← Route: 'customers'
│   ├── CustomerManager            ← Customer list
│   ├── CustomerModal              ← Create/edit customer
│   └── CustomerDetailModal        ← Customer detail: transactions, payments, credit
│
├── DISCOUNTS                      ← Route: 'discounts'
│   ├── DiscountManager            ← Promotion list
│   └── DiscountModal              ← Create/edit discount
│
├── EXPENSES                       ← Route: 'expenses'
│   ├── ExpenseManager             ← Expense list + chart
│   └── ExpenseModal               ← Create/edit expense
│
├── REPORTS                        ← Route: 'reports'
│   └── ReportsManager             ← Reports hub (5 sub-tabs)
│       ├── SalesReport            ← Chart: trend + category pie + top products
│       ├── ExpensesReport         ← Chart: category pie + trend
│       ├── CustomersReport        ← Top customers table
│       ├── FinancialReport        ← P&L: revenue, COGS, profit, wallet breakdown
│       └── InventoryReport        ← Wraps InventoryReportManager
│           └── InventoryReportManager ← Per-product stock value, profit, integrity check
│
├── USERS / PERMISSIONS            ← Route: 'users'
│   ├── UserManager                ← User list
│   └── UserModal                  ← Create/edit user + permissions
│
├── SETTINGS                       ← Route: 'settings'
│   ├── Settings                   ← Main settings (5 sub-tabs)
│   │   ├── BackupTab              ← Backup/restore
│   │   ├── CloudSyncTab           ← Sync toggles
│   │   ├── DatabaseTools          ← Export/import/purge/audit
│   │   ├── PasswordChange         ← Update password
│   │   └── ReceiptPreview         ← Live receipt preview
│   ├── LogoUpload                 ← Store logo upload
│   └── ReceiptPreview
│
├── COMMON / SHARED
│   ├── Modal / ModernModal
│   ├── DialogProvider
│   ├── SearchableSelect
│   ├── CameraScanner
│   ├── BarcodePreview
│   ├── HelpTooltip
│   └── TouchKeyboard
│
├── CONTEXT / STATE
│   ├── AuthContext                 ← Auth state + signIn/signOut/signUp
│   ├── SupabaseAppContext          ← Global app state (cart, products, sales, settings, etc.)
│   └── TouchKeyboardProvider       ← Virtual keyboard state
│
├── HOOKS
│   ├── useCartCalculations         ← Cart math (subtotal, discounts, tax, total)
│   ├── useTranslation              ← i18n system
│   ├── usePOSKeyboard              ← Keyboard shortcut handler
│   ├── useHardwareScanner          ← Barcode scanner integration
│   ├── useSoundFeedback            ← Click/notification sounds
│   ├── useInvoiceGeneration        ← Invoice number generation
│   ├── useSync                     ← Sync status tracking
│   └── useNetworkStatus            ← Online/offline detection
│
├── LIB (DATA LAYER)
│   ├── services.ts                 ← All CRUD services (products, sales, customers, etc.) + Supabase API
│   ├── localDb.ts                  ← IndexedDB (Dexie.js) — all local tables
│   ├── syncEngine.ts               ← Background sync: local → Supabase
│   ├── currencies.ts               ← Currency formatting
│   ├── sonner.ts                   ← Toast wrapper
│   ├── dialog.tsx                  ← Dialog system API
│   ├── sounds.ts                   ← Sound effect player
│   └── ... (see section below)
│
└── TYPES
    └── index.ts                    ← All interfaces: Product, Sale, CartItem, Customer, Bundle, etc.
```

---

# 📄 PAGE-BY-PAGE DETAIL

---

## 1. AUTH / LOGIN

### LoginPage
- **Route**: `'login'` (shown when no user or user inactive)
- **File**: `src/components/auth/LoginPage.tsx`
- **Plain**: Sign-in screen with email/username and password fields, plus a "Forgot Password?" flow.
- **Technical**: Standalone page, renders when `!user || !state.currentUser || !state.currentUser.active`. Uses `useAuth().signIn()`, `useAuth().signUp()`, `useAuth().resetPassword()`. Calls `syncNow()` after login to pull remote data. Includes a roles-based redirect (admin/manager → dashboard, cashier → pos).
- **Buttons/actions**: Sign In, Create Account (sign-up toggle), Forgot Password.
- **Data flow**: Reads nothing locally. Writes auth session, triggers initial sync.
- **Links to**: POSTerminal (default after login), DashboardManager (admin/manager after login).

### ResetPasswordPage
- **Route**: `'reset-password'` (shown when `isRecoveringPassword` is true)
- **File**: `src/components/auth/ResetPasswordPage.tsx`
- **Plain**: Password reset form with new password + confirm fields.
- **Technical**: Uses `useAuth().updatePassword()` and `setIsRecoveringPassword()`. Rendered directly inside App.tsx when `isRecoveringPassword` is true, bypassing the normal layout.
- **Buttons/actions**: Submit new password.
- **Links to**: LoginPage after success.

---

## 2. LAYOUT

### Header
- **File**: `src/components/layout/Header.tsx`
- **Plain**: Top navigation bar with clickable view tabs, user dropdown, theme toggle, layout toggle, sync badge.
- **Technical**: Receives `currentView` and `onViewChange` from App. Renders view buttons: POS (pos), Sales (transactions), Stock (inventory), Customers, Discounts, Expenses, Reports, Settings, Dashboard. Highlights active view. User menu shows role + name + sign out. SyncStatusBadge shows connection state. Theme toggle (dark/light/auto). Layout toggle for touch mode.
- **Data reads**: `state.currentUser`, `state.settings`.
- **Data writes**: Dispatches `SET_SETTINGS` for theme/layout changes.
- **Links to**: All pages via `onViewChange`.

### MobileBottomNav
- **File**: `src/components/layout/MobileBottomNav.tsx`
- **Plain**: Fixed bottom navigation bar on mobile with 4-5 icon buttons.
- **Technical**: Shows Home (dashboard for admin/manager, POS for cashier), POS, Sales, Stock, and a menu button that opens mobile navigation drawer.
- **Data reads**: `state.currentUser.role`.
- **Links to**: Dashboard, POS, Transactions, Inventory, mobile menu.

### SyncStatusBadge
- **File**: `src/components/layout/SyncStatusBadge.tsx`
- **Plain**: Small pill in header showing sync status (syncing, error, offline, up-to-date). Click opens SyncQueueManager.
- **Technical**: Uses `useSync()` hook. Displays spinning icon when syncing, red when error, amber when offline, green check when connected. Click toggles SyncQueueManager modal.

### SyncQueueManager
- **File**: `src/components/layout/SyncQueueManager.tsx`
- **Plain**: Modal showing pending sync operations grouped by entity type. Allows retrying all or clearing stuck ops.
- **Technical**: Reads `localDb.pendingOps`. Groups by entity type. Shows count per status (pending/retrying/stuck). Calls `retrySyncAll()`, `clearStuckOps()`, `syncNow()`.

### OfflineBanner
- **File**: `src/components/OfflineBadge.tsx`
- **Plain**: Sticky amber banner at screen top when browser is offline. Shows pending operation count.
- **Technical**: Listens to `navigator.onLine` changes and `pendingops-changed` custom event. Auto-hides when online.

---

## 3. POS (POINT OF SALE) — Route: `'pos'`

### POSTerminal — Main POS Screen
- **Route**: `'pos'` (default route for all users)
- **File**: `src/components/pos/POSTerminal.tsx`
- **Plain**: The main cash register screen. Left side = product catalog grid, right side = cart sidebar. Search products, scan barcodes, add to cart, manage multiple tabs, apply discounts, open checkout.
- **Technical**: Orchestrator component (no props). Manages local state for checkout, mobile cart drawer, drafts modal, shortcuts modal, return mode toggle, scanner state, product options modal. Uses `useHardwareScanner` for physical scanner input. Uses `usePOSKeyboard` for keyboard shortcuts. Uses `useSoundFeedback` for click/payment sounds. Uses `useCartCalculations` for totals.
- **Layout**: Desktop = two columns (ProductGrid + Cart). Mobile = ProductGrid full-width + floating cart bottom bar + centered cart drawer.
- **Views/sub-components composed**: ProductGrid, Cart, CheckoutPage (modal overlay), CheckoutModal (legacy), DraftsModal, ProductOptionsModal, ShortcutsModal, SalesTabManager, GridDensityController.
- **Key functions**: `addToCart()` (handles quantity grouping, stock warnings, return mode negation, variant/modifier support), `handleScan(barcode)` (barcode lookup → addToCart), `saveDraft()` (creates DRAFT_SALE sale record), `loadDraft(draft)` (restores cart + customer, deletes draft).
- **Data reads**: `state.cart`, `state.products`, `state.settings`, `state.activeSalesTab`, `state.salesTabs`, `state.selectedCustomer`, `state.currentUser`.
- **Data writes**: `ADD_TO_CART`, `UPDATE_CART_ITEM`, `CLEAR_CART`, `ADD_SALE`, `DELETE_SALE`, `SET_SELECTED_CUSTOMER`, `UPDATE_SALES_TAB`, `SET_EDITING_SALE`.
- **Links to**: CheckoutPage (on checkout), CheckoutModal (legacy), DraftsModal.

### ProductGrid — Catalog Grid
- **File**: `src/components/pos/ProductGrid.tsx`
- **Plain**: The product catalog section of POS. Shows products as cards in a configurable grid. Has search bar (detects barcodes automatically), category filter chips, grid density controls, camera scanner button, drafts badge, and bundle deal cards.
- **Internal components**: `ProductCard` (single product with price, stock badge, featured star, +/- cart controls), `BundleGrid` (shows bundle deals with image collage, price, "Add Deal" button).
- **Search**: Auto-detects barcodes with 200ms debounce. Typing switches category to "All". Clear search resets to selected category. Aggressive refocus on input.
- **Bundles**: "Add Deal" calls `bundlesService.getBundleCartItems()` to expand bundle into CartItem[], merges into cart via `SET_CART`.
- **Data reads**: `state.products`, `state.settings`, `state.cart`, `state.sales` (for drafts count), `state.bundles`.
- **Data writes**: `UPDATE_CART_ITEM` (via ProductCard +/-), `SET_CART` (via BundleGrid), `SET_INVENTORY_TAB` (via "Manage Deals").
- **Props**: `onAddToCart`, `onOpenDrafts`, `onAddTab`, `isReturnMode`.
- **Links to**: CameraScanner, Cart (via addToCart), InventoryManager > BundleManager (via "Manage Deals"), DraftsModal.

### Cart — Shopping Cart
- **File**: `src/components/pos/Cart.tsx`
- **Plain**: Cart panel showing all items added to current sale. Items grouped into bundles and standalone. Quantity +/- controls, per-item discounts, inline price editing, customer selection, bill discount input, promotions picker, grand total, save draft, checkout button.
- **Internal components**: `CartItemCard` (individual line item display with product info, variant/modifier/serial, price, quantity stepper, subtotal, discount/edit/remove actions).
- **Bundle handling**: Groups cart items by `bundleId` → shows bundle summary row (name, qty stepper, deal price, remove) and bundle items as separate `CartItemCard` entries with "from deal" badge and static qty display.
- **Customer flow**: Search customers → quick-add if not found → select → shows WhatsApp, View, Remove actions.
- **Bill discount**: %/$ toggle, numeric input, shows calculated discount amount, clear button, promotions picker button.
- **Promotions**: Opens modal listing active discounts. Selecting one applies as bill discount.
- **Data reads**: `state.cart`, `state.selectedCustomer`, `state.customers`, `state.settings`, `state.bundles`, `state.discounts`, `state.billDiscountValue/Type`, `state.activeSalesTab`, `state.editingSaleId`, `state.notes`.
- **Data writes**: `UPDATE_CART_ITEM`, `REMOVE_FROM_CART`, `CLEAR_CART`, `SET_CART`, `SET_SELECTED_CUSTOMER`, `ADD_CUSTOMER`, `UPDATE_SALES_TAB`, `SET_NOTES`.
- **Props**: `onCheckout`, `onSaveDraft`, `isMobileDrawer`, `onClose`.
- **Links to**: CheckoutPage (via onCheckout), CustomerDetailModal, Promotion selection modal, useCartCalculations.

### CheckoutPage — Full Settlement Page
- **Route**: Overlay on POS (set `showCheckout = true`)
- **File**: `src/components/pos/CheckoutPage.tsx`
- **Plain**: Payment settlement screen. Two columns: order summary (left) + payment (right). Choose payment method (Cash/Card/Bank Transfer/Credit/Split), enter amount received, quick amount buttons, split payments, extra charges (e-store delivery), sale type (Retail/Wholesale/E-Store), notes. On completion: processes sale, deducts stock, creates history, shows receipt.
- **Technical**: Rendered as a `<Modal>` wrapper with two-column layout. Uses `usePOSKeyboard` for checkout shortcuts (1-5 for methods, E for exact, Enter to process). Calculates `finalTotal = baseTotal + extraChargesTotal`. Filters cart to `checkoutCartItems` (excludes zero-qty items). Handles bill edit two-phase pattern (delete old sale → create new sale). Generates invoice number via `useInvoiceGeneration`.
- **Payment methods**: Cash (green), Card (blue), Bank Transfer (purple), Credit (amber, only if customer selected), Split (if enabled in settings).
- **Split payments**: Add method rows with method dropdown + amount inputs + remove button. Validates sum matches total.
- **Data reads**: `state.cart`, `state.selectedCustomer`, `state.settings` (retailEnabled, wholesaleEnabled, estoreEnabled, currency, taxRate, allowCreditOverLimit, enableSplitPayment, receiptShowDiscount, defaultSaleType), `state.discounts`, `state.editingSaleId`, `state.sales`, `state.billDiscountValue/Type`, `state.notes`.
- **Data writes**: `ADD_SALE`, `CLEAR_CART`, `DELETE_SALE`, `SET_SALES`, `SET_EDITING_SALE_ID`.
- **Props**: `onClose`, `onComplete`.
- **Links to**: ReceiptPrint (on completion), ShortcutsModal, CustomerDetailModal.

### CheckoutModal — (Legacy) Settlement Modal
- **File**: `src/components/pos/CheckoutModal.tsx`
- **Plain**: Older payment modal — same purpose as CheckoutPage but as a modal. Has DC Number, Other Amount fields instead of extra charges. May be unused in current flow.
- **Technical**: Same core logic as CheckoutPage but with slightly different UI (dcNumber, otherAmount fields). Appears to be legacy — CheckoutPage is the primary implementation.
- **Data reads/writes**: Same as CheckoutPage.
- ⚠️ **Suspected**: This may be dead code or used only for bill edit mode from TransactionsManager.

### ReceiptPrint — Receipt Display + Print + Share
- **File**: `src/components/pos/ReceiptPrint.tsx`
- **Plain**: After sale completion, shows the receipt. Supports print (thermal/A4), share as image/PDF, WhatsApp message. Configurable paper size, template, font scale, padding, offsets.
- **Technical**: Renders receipt as styled JSX. Printable via `window.print()` (iframe) or Electron `electronAPI.printHtml()`. Share via `html2canvas` → canvas → blob → Web Share API or download. WhatsApp via `wa.me` URL with text body. Supports 58mm (219px), 80mm (302px), A4 (794px) paper sizes. Templates: Modern, Classic, Professional, Minimal, Bold, Compact. Auto-print flow: 1.5s delay → print → 3s delay → auto-close.
- **Receipt contents**: Store logo, name, address, phone, invoice #, date, cashier, customer, itemized table (with bundle grouping), subtotal, discounts (deal/item/bill), tax, grand total, payment breakdown, change, barcode, footer text, notes.
- **Data reads**: `state.settings` (extensive: storeInfo, receiptDesign, currency, taxRate, invoicePrefix), `profile` (cashier name).
- **Props**: `sale`, `onClose`.
- **Links to**: Nothing (terminal node — emits onClose).

### DraftsModal — Draft Sales Archive
- **File**: `src/components/pos/DraftsModal.tsx`
- **Plain**: Shows all saved draft orders. Click to load, trash to delete.
- **Technical**: Filters `state.sales` for records where `notes` includes `'DRAFT_SALE'`. Renders in 2-column card grid. Load calls `onLoadDraft` which restores cart + customer + deletes draft. Delete calls `salesService.delete()` + dispatches `DELETE_SALE`.
- **Data reads**: `state.sales`.
- **Data writes**: `DELETE_SALE`.
- **Props**: `isOpen`, `onClose`, `onLoadDraft`.

### SalesTabManager — Multi-Tab Cart
- **File**: `src/components/pos/SalesTabManager.tsx`
- **Plain**: Manages up to 3 independent sales tabs. Each tab maintains its own cart and selected customer.
- **Technical**: Color-coded tabs (emerald/blue/orange/purple/rose/teal cycle). On tab switch: saves current cart/customer to current tab via `UPDATE_SALES_TAB`, then sets active tab. Create tab via `salesTabsService.create()` + `ADD_SALES_TAB`. Delete tab removes via `REMOVE_SALES_TAB` and switches to neighbor. Listens for `create-new-tab` custom event.
- **Data reads**: `state.salesTabs`, `state.activeSalesTab`, `state.cart`, `state.selectedCustomer`.
- **Data writes**: `ADD_SALES_TAB`, `SET_ACTIVE_SALES_TAB`, `UPDATE_SALES_TAB`, `REMOVE_SALES_TAB`.

### ProductOptionsModal — Variants/Modifiers/Serial Picker
- **File**: `src/components/pos/ProductOptionsModal.tsx`
- **Plain**: Shown when a product needs variant selection, modifier add-ons, or serial number before adding to cart.
- **Technical**: Renders variant groups as button rows (one selection per group), modifiers as toggle buttons, serial number text input (auto-uppercase). Shows running total (base price + modifier prices). Validates all required selections before allowing "Add to Cart".
- **Props**: `product`, `isOpen`, `onClose`, `onConfirm`.
- **Links to**: POSTerminal (via onConfirm callback that calls addToCart).

### ShortcutsModal — Keyboard Shortcuts Guide
- **File**: `src/components/pos/ShortcutsModal.tsx`
- **Plain**: Reference card showing all keyboard shortcuts for POS Terminal and Checkout screens.
- **Technical**: Pure presentation. Terminal shortcuts (F2-F7, Ctrl+Del, /) and Checkout shortcuts (1-5, E, Enter, Esc). 2-column grid layout.
- **Props**: `isOpen`, `onClose`.

### GridDensityController — Grid Column Count
- **File**: `src/components/pos/GridDensityController.tsx`
- **Plain**: Row of buttons to set product grid column count: Auto + 1-8.
- **Technical**: Reads `state.settings.posGridColumns`. On click dispatches `SET_SETTINGS` + calls `settingsService.update()` for instant cloud sync.
- **Data reads**: `state.settings.posGridColumns`.
- **Data writes**: `SET_SETTINGS`.

### SyncQueueModal — POS Sync Queue
- **File**: `src/components/pos/SyncQueueModal.tsx`
- **Plain**: Shows pending sync operations in a queue. Retry individual/all, delete stuck items.
- **Technical**: Fetches `localDb.pendingOps` on mount. Listens for `pendingops-changed` event. Status badges: PENDING (blue), RETRYING (amber), STUCK (red ≥5 retries). Retry All calls `syncNow()`.
- **Props**: `onClose`.

---

## 4. DASHBOARD — Route: `'dashboard'`

### DashboardManager
- **Route**: `'dashboard'` (default for admin/manager on first login)
- **File**: `src/components/dashboard/DashboardManager.tsx`
- **Plain**: Home screen showing today's sales stats, revenue by payment method, recent transactions, quick action cards, and a chart.
- **Technical**: Reads all sales and expenses for today. Computes wallet breakdown (cash/card/digital). Shows stat cards (Total Sales, Cash, Card, Digital). Quick action row: New Sale (→pos), Add Item (→inventory), Today Report (→reports). Recent transactions list with click to view. Chart widget.
- **Data reads**: `state.sales`, `state.expenses`, `state.customers`.
- **Data writes**: None (read-only dashboard).
- **Props**: `onNavigate`.
- **Child components**: MagicalClock.
- **Links to**: POS (New Sale), Inventory (Add Item), Reports (Today Report).

### MagicalClock
- **File**: `src/components/dashboard/MagicalClock.tsx`
- **Plain**: Animated clock widget with 3 visual themes (vortex, cosmic, digital).
- **Technical**: Pure visual component with CSS animations. No data dependencies.

---

## 5. TRANSACTIONS / SALES HISTORY — Route: `'transactions'`

### TransactionsManager
- **Route**: `'transactions'`
- **File**: `src/components/transactions/TransactionsManager.tsx`
- **Plain**: Full sales history page. Search by date range, cashier, payment method, store type. Paginated list. Click a sale to view details, edit, delete, print receipt, or process refund/return.
- **Technical**: Filters `state.sales` by date range, cashier, payment method, store type, search text. Desktop table + mobile list. Paginated. Sale detail modal shows full sale breakdown: items, discounts, payments, totals. Edit opens CheckoutModal in edit mode. Delete (admin only) with stock reversal. Refund flow: opens sale → processes return → creates adjustment stock history. Print reopens ReceiptPrint.
- **Refund/Return flow**:
  1. User clicks Refund on a sale row
  2. Confirmation dialog
  3. For each item, stock is added back (negative sale = stock in)
  4. Stock history created with type 'sale_return'
  5. Sale is deleted or flagged
- **Data reads**: `state.sales`, `state.products`.
- **Data writes**: `DELETE_SALE`, `UPDATE_SALE`, `UPDATE_PRODUCT`, `ADD_PURCHASE_RECORD`.
- **Props**: `onViewChange`.
- **Links to**: CheckoutModal (bill edit), ReceiptPrint (reprint), ProductDetailHub (view product from sale).

---

## 6. PRODUCTS / INVENTORY — Route: `'inventory'`

### InventoryManager — Main Inventory Page
- **Route**: `'inventory'`
- **File**: `src/components/inventory/InventoryManager.tsx`
- **Plain**: Central product management hub. Product list with search, filter, sort, pagination. Tabs for Products, Purchase Orders, Groups (category/supplier views), Media Library, Purchases (stock-in history), Bundles & Deals.
- **Technical**: Orchestrator with tab navigation (`state.inventoryActiveTab`). Desktop: table view with column sorting. Mobile: card grid. Search with debounce. Filter by category, supplier, product type (all/active/inactive/featured/service/low-stock). Bulk selection with actions (bulk edit, delete, print barcodes). Import/export JSON.
- **Tab contents**:
  - `inventory` (default): Product table with bulk actions
  - `purchase_orders`: PurchaseOrderSystem component
  - `groups`: Category + Supplier group chips, AuditTimeline, ActionHistory
  - `media`: MediaLibrary component (standalone mode)
  - `purchases`: PurchaseHistory component
  - `bundles`: BundleManager component
- **Data reads**: `state.products`, `state.settings`, `state.inventoryActiveTab`, `state.lastProductHubId`, `state.pendingReturnTab`, `state.currentUser`.
- **Data writes**: `DELETE_PRODUCT`, `UPDATE_PRODUCT`, `SET_PRODUCTS`, `ADD_PRODUCTS_BULK`, `SET_INVENTORY_TAB`, `SET_LAST_PRODUCT_HUB`, `SET_PENDING_RETURN_TAB`.
- **Links to**: ProductModal, ProductDetailHub, BarcodeGenerator, BulkEditModal, BatchStockInSystem, PurchaseHistory, AuditTimeline, PurchaseOrderSystem, BundleManager, MediaLibrary, SupplierManager, CameraScanner.

### ProductModal — Create/Edit Product
- **File**: `src/components/inventory/ProductModal.tsx`
- **Plain**: Full product creation/editing form. Fields: name, SKU, barcode, price, cost, stock, minStock, category, supplier, description, image, active/taxable/featured/trackInventory/isService/requireSerial toggles. Variants builder, modifiers builder, batch management.
- **Technical**: `<Modal>` wrapper. Auto-generates SKU from name. Auto-generates barcode. Image upload with compression (WebP ~20-50KB). Media Library integration for image picking. Variants as tag-input rows (e.g., Size: S/M/L). Modifiers as name + price pairs. Batch management with expandable section (shows existing batches).
- **Data reads**: `state.categories`, `state.products`, `state.suppliers`, `state.currentUser`, `state.settings`.
- **Data writes**: `ADD_PRODUCT`, `UPDATE_PRODUCT`, `SET_SUPPLIERS` (auto-creates supplier if new).
- **Props**: `isOpen`, `onClose`, `product` (null = create mode).
- **Links to**: CameraScanner, MediaLibrary, SearchableSelect (category/supplier).

### ProductDetailHub — Product Detail + Edit (Full Page)
- **File**: `src/components/inventory/ProductDetailHub.tsx`
- **Plain**: Deep dive into a single product. Header with image, status, SKU, category. KPI cards (Revenue, Sold Qty, COGS, Margin, Stock Value). Quick controls (min stock, prices). Edit mode toggles identity details, variants, modifiers, batches. Movement history timeline (sales + purchases unified). Stock adjustment modal.
- **Technical**: Full-page overlay within InventoryManager. Edit mode toggles section visibility. KPIs computed from `state.sales` and `state.purchaseRecords`. History table unified from sales (as negative) + purchase records (as positive), filterable by ALL/IN/OUT. Batch Stock In integration via `BatchStockInSystem`. Sticky save bar at bottom when editing.
- **Data reads**: `state.products`, `state.sales`, `state.purchaseRecords`, `state.suppliers`, `state.settings`, `profile`.
- **Data writes**: `UPDATE_PRODUCT`, `ADD_PURCHASE_RECORD`, `SET_PENDING_RETURN_TAB`, `SET_LAST_PRODUCT_HUB`, `SET_PENDING_SEARCH`.
- **Props**: `product`, `onBack`, `onEdit`.
- **Links to**: BatchStockInSystem, CameraScanner, MediaLibrary, SearchableSelect, TransactionsManager (via SET_PENDING_RETURN_TAB).

### BarcodeGenerator — Barcode/QR Label Printer
- **File**: `src/components/inventory/BarcodeGenerator.tsx`
- **Plain**: Full barcode/QR code label printing engine. Choose paper size (A4 + 6 thermal sizes), configure columns/rows, quantities per product, content to show (name/price/SKU/category/border), barcode dimensions (scale, height, bar width, zoom, padding, margins, gaps). Live preview with autofit. Print via `react-to-print`.
- **Technical**: Uses `JsBarcode` for SVG barcodes, `qrcode.react` for QR codes. Paper sizes: A4, Thermal 50×25, 40×30, 50×30, 50×40, 60×40, 80×40, 80×50 (mm). Persists settings to localStorage + module-level globals. Saves as defaults to `AppSettings`.
- **Data reads**: `state.settings` (barcode preferences).
- **Data writes**: `SET_SETTINGS` (save defaults).
- **Props**: `products`, `onClose`, `onProductsChange`.

### BulkEditModal — Bulk Product Update
- **File**: `src/components/inventory/BulkEditModal.tsx`
- **Plain**: Edit multiple products at once: price, cost, category, supplier, image, active/taxable/featured status. Tri-state toggles (unchanged/true/false).
- **Technical**: Modal with tri-state checkbox pattern (click cycles: undefined → true → false → undefined). Image upload/Media Library for bulk image replacement. Commits via `productsService.bulkUpdate()`.
- **Data reads**: `state.products`, `state.settings`.
- **Data writes**: `SET_PRODUCTS`.
- **Props**: `isOpen`, `onClose`, `selectedIds`, `categories`, `suppliers`.
- **Links to**: MediaLibrary.

### BatchStockInSystem — Bulk Stock-In
- **File**: `src/components/inventory/BatchStockInSystem.tsx`
- **Plain**: Add stock to multiple products at once. Search products, add to staging list, set quantity/cost/retail/supplier per item, commit all. Creates purchase records, product batches, updates stock, logs history.
- **Technical**: Modal with searchable product adder. Staging matrix with inline editable qty/cost/retail/supplier. On commit: creates purchase record per item via `purchaseRecordsService.create()`, creates/updates product batch, updates `product.stock`, logs to `stockHistory`.
- **Data reads**: `state.products`, `state.currentUser`, `state.settings`, `profile`.
- **Data writes**: `UPDATE_PRODUCT`, `ADD_PURCHASE_RECORD`.
- **Props**: `onClose`, `initialProduct`.

### PurchaseOrderSystem — Auto/Manual PO
- **File**: `src/components/inventory/PurchaseOrderSystem.tsx`
- **Plain**: Generate purchase orders. Auto mode = finds products below minStock. Manual mode = search and add products. Editable qty/cost/price/supplier per row. "Admit All to Stock" creates purchase records and updates inventory.
- **Technical**: Two modes: Auto (computes neededQty = targetStock - currentStock for products where currentStock < minStock) and Manual (search, scan barcode, add one-by-one or "Add All Items"). Supplier + category filters. CSV export, print. "Admit All" converts PO rows to actual stock entries via batch creation.
- **Data reads**: `state.products`, `state.settings`, `profile`.
- **Data writes**: `ADD_PURCHASE_RECORD`, `UPDATE_PRODUCT`.

### BundleManager — Bundle/Deal CRUD
- **File**: `src/components/inventory/BundleManager.tsx`
- **Plain**: Create/edit/delete bundle deals. Pick products, set quantities, discount type (% or fixed), hide item prices toggle. Live price preview.
- **Technical**: Tab content within InventoryManager. Form state: name, description, discountValue, discountType, hideItemPrices, items[]. Product picker with search + quantity +/-. Live total: originalTotal - discount = final price. Active toggle, delete with confirmation. Mobile 3-dot menu.
- **Data reads**: `state.products`, `state.bundles`, `state.settings`, `profile`.
- **Data writes**: `ADD_BUNDLE`, `UPDATE_BUNDLE`, `DELETE_BUNDLE`.

### PurchaseHistory — Stock-In History
- **File**: `src/components/inventory/PurchaseHistory.tsx`
- **Plain**: All purchase/stock-in records. Search/filter by supplier, category, user, date range. Paginated. Row click navigates to product hub or transaction. CSV export. Delete records with stock reversal.
- **Technical**: Filters `state.purchaseRecords`. Stats cards: Total Procurement, Total Stock In, Main Supplier. Desktop table + mobile card views. "New Stock In" button opens BatchStockInSystem. Row click: if record has `saleId` → navigates to transaction; else → navigates to product hub. Delete (admin) reverts stock + deletes record.
- **Data reads**: `state.products`, `state.purchaseRecords`, `state.settings`, `state.currentUser`.
- **Data writes**: `ADD_PURCHASE_RECORD`, `UPDATE_PRODUCT`, `DELETE_PURCHASE_RECORD`, `SET_INVENTORY_PURCHASES_PAGE`, `SET_PENDING_RETURN_TAB`, `SET_PENDING_SEARCH`.
- **Links to**: BatchStockInSystem, ProductDetailHub, TransactionsManager.

### AuditTimeline — Unified Audit Timeline
- **File**: `src/components/inventory/AuditTimeline.tsx`
- **Plain**: Chronological feed of all stock movements (purchases + sales + adjustments) from localDb. Tab-filtered: All/Stock In/Sales/Returns. Search, pagination. Click to view product or bill.
- **Technical**: Loads `localDb.stockHistory` + `localDb.purchaseRecords`, unifies into single timeline sorted by date. Tab filters with counts. Pagination prev/next. Eye icon → view product. Receipt icon → view bill (only for sales/returns).
- **Data reads**: `localDb.stockHistory`, `localDb.purchaseRecords`, `state.products`.
- **Props**: `onViewProduct`, `onViewBill`.

### ActionHistory — Stock Action History Viewer
- **File**: `src/components/inventory/ActionHistory.tsx`
- **Plain**: Stock action history fetched from server (supabase), not localDb. Shows all stock movements (type, product, qty, reference, user). Filter by tab (All/Stock In/Stock Out/Returns), search, date range, user.
- **Technical**: Fetches via `stockHistoryService.getAll()`. Desktop table view. Shows retention notice (last 300 entries). Row click → view product.
- **Data reads**: `state.products` (resolves product names).
- **Props**: `onViewProduct`.

### MediaLibrary — Image Gallery
- **File**: `src/components/inventory/MediaLibrary.tsx`
- **Plain**: Grid gallery of all product images + store logo. Click to select/use image. Delete removes image from all associated products.
- **Technical**: Extracts unique image URLs from `state.products`. Grid layout. Store logo shown as non-deletable system asset. Delete: finds all products using that image, bulk-updates them to remove it.
- **Data reads**: `state.products`, `state.settings`.
- **Data writes**: `SET_PRODUCTS`.
- **Props**: `isOpen`, `onClose`, `onSelect`, `standalone`.

---

## 7. SUPPLIERS — Route: `'suppliers'`

### SupplierManager — Supplier List
- **Route**: `'suppliers'`
- **File**: `src/components/inventory/suppliers/SupplierManager.tsx`
- **Plain**: All suppliers shown as cards in a grid. Search, date filter, stats (Active Partners, Total Payables). Add/Edit via SupplierModal. Delete with product association check. Click "View Ledger" opens per-supplier ledger.
- **Technical**: Reads `state.suppliers`. Computes total payables from `suppliersService.getMultipleBalances()`. Cards show name, phone, business type, balance. Date range filter (all/today/yesterday/last7/thisMonth/lastMonth/custom).
- **Data reads**: `state.suppliers`, `state.products`, `state.settings`, `state.currentUser`, `profile`.
- **Data writes**: `SET_SUPPLIERS`, `UPDATE_SUPPLIER`, `DELETE_SUPPLIER`.
- **Links to**: SupplierModal, SupplierLedger.

### SupplierModal — Supplier Create/Edit
- **File**: `src/components/inventory/suppliers/SupplierModal.tsx`
- **Plain**: Form for adding/editing a supplier. Fields: Name, Contact Person, Phone, Email, NTN, Address, Opening Balance, Business Type, Payment Terms.
- **Technical**: `<Modal>` wrapper. Calls `onSave` prop which is handled by SupplierManager.
- **Props**: `isOpen`, `onClose`, `onSave`, `supplier`.
- **Links to**: SupplierManager.

### SupplierLedger — Per-Supplier Ledger
- **File**: `src/components/inventory/suppliers/SupplierLedger.tsx`
- **Plain**: Shows all transactions (bills + payments) for one supplier. Header with supplier info + balance. Stats: Total Billed, Total Paid, Remaining Debt. Record Payment (with auto-expense creation) and Record Bill modals.
- **Technical**: Loads via `suppliersService.getLedger()` (manual entries only — purchases from PO are NOT included automatically). Record Payment: amount + method (cash/card/digital) + note → creates ledger entry + auto-creates expense via `expensesService.create()`. Record Bill: amount + note. Delete transaction (admin only). "Load More" pagination (50 per page).
- **Data reads**: `state.settings`, `state.currentUser`.
- **Data writes**: `ADD_EXPENSE` (when recording payment).
- **Props**: `supplier`, `onBack`, `startDate`, `endDate`, `dateFilter`.
- **Links to**: ExpenseManager (via auto-expense creation).

---

## 8. CUSTOMERS — Route: `'customers'`

### CustomerManager — Customer List
- **Route**: `'customers'`
- **File**: `src/components/customers/CustomerManager.tsx`
- **Plain**: All customers listed with search, pagination. Click to view detail, edit, or delete.
- **Technical**: Reads `state.customers`. Desktop table or mobile cards. Search by name/phone/email. Pagination. Add/Edit via CustomerModal. Delete with confirmation.
- **Data reads**: `state.customers`.
- **Data writes**: `ADD_CUSTOMER`, `UPDATE_CUSTOMER`, `DELETE_CUSTOMER`.
- **Links to**: CustomerModal, CustomerDetailModal.

### CustomerModal — Customer Create/Edit
- **File**: `src/components/customers/CustomerModal.tsx`
- **Plain**: Form for customer details: name, email, phone, address, credit limit, price tier, notes, preferred categories.
- **Technical**: `<Modal>` wrapper. Credit limit field for setting customer's max credit. Price tier (retail/wholesale). Preferred categories as tag input.
- **Data reads**: Uses `useApp()` for dispatch.
- **Data writes**: `ADD_CUSTOMER`, `UPDATE_CUSTOMER`.
- **Props**: `isOpen`, `onClose`, `customer`.

### CustomerDetailModal — Customer Deep-Dive
- **File**: `src/components/customers/CustomerDetailModal.tsx`
- **Plain**: Full customer profile: info, sales history, payment history, credit status. Record credit payment (wasooli).
- **Technical**: Lists all sales for this customer from `state.sales`. Shows credit used, credit limit, remaining credit. Record Payment: amount + method → dispatches `UPDATE_CUSTOMER` (reduces creditUsed) + creates expense record.
- **Data reads**: `state.sales`, `state.customers`.
- **Data writes**: `UPDATE_CUSTOMER`, `ADD_EXPENSE`.
- **Props**: `isOpen`, `onClose`, `customer`.
- **Links to**: ExpenseManager (via auto-expense).

---

## 9. DISCOUNTS — Route: `'discounts'`

### DiscountManager — Promotion List
- **Route**: `'discounts'`
- **File**: `src/components/discounts/DiscountManager.tsx`
- **Plain**: All promotions/discounts listed. Add/Edit via DiscountModal. Toggle active/inactive. Delete.
- **Technical**: Reads `state.discounts`. Cards show name, type (%/fixed/free_gift/bogo), value, dates, applicable products/categories, conditions. Active toggle dispatches `UPDATE_DISCOUNT`.
- **Data reads**: `state.discounts`, `profile`.
- **Data writes**: `DELETE_DISCOUNT`.
- **Links to**: DiscountModal.

### DiscountModal — Create/Edit Discount
- **File**: `src/components/discounts/DiscountModal.tsx`
- **Plain**: Create/edit a promotion. Types: Percentage Off, Fixed Amount, Free Gift, BOGO. Conditions: min amount, min quantity, valid dates, applicable products/categories. Auto-promotion mode (auto-applies at POS if cart qualifies).
- **Technical**: Form with conditional sections per type. Free Gift type: select a free product, set min qty. BOGO type: buy qty, get qty free. Valid days of week checkboxes. Start/end date pickers. Products: select all/specific/specific categories.
- **Data reads**: `state.discounts`, `state.products`, `state.categories`, `state.settings`.
- **Data writes**: `ADD_DISCOUNT`, `UPDATE_DISCOUNT`.
- **Props**: `isOpen`, `onClose`, `discount` (null = create mode).

---

## 10. EXPENSES — Route: `'expenses'`

### ExpenseManager — Expense List + Chart
- **Route**: `'expenses'`
- **File**: `src/components/expenses/ExpenseManager.tsx`
- **Plain**: All business expenses listed. Filter by date, category, payment method, cashier. Search. Stats cards + trend chart. Add/Edit/Delete.
- **Technical**: Reads `state.expenses`. Filters by date range, category, payment method, user. Desktop table + mobile cards. Stats: Total Expenses, by category. Trend chart (bar). Delete with confirmation.
- **Data reads**: `state.expenses`, `state.users`.
- **Data writes**: `ADD_EXPENSE`, `UPDATE_EXPENSE`, `DELETE_EXPENSE`.
- **Links to**: ExpenseModal.

### ExpenseModal — Create/Edit Expense
- **File**: `src/components/expenses/ExpenseModal.tsx`
- **Plain**: Form: description, amount, category, date, payment method, store type, notes.
- **Technical**: `<ModernModal>` wrapper. Category dropdown (Rent, Utilities, Salary, Marketing, etc.). Payment method (Cash/Card/Digital). Store type (Physical/Online/Both).
- **Props**: `isOpen`, `onClose`, `expense`, `onSave`.

---

## 11. REPORTS — Route: `'reports'`

### ReportsManager — Reports Hub
- **Route**: `'reports'`
- **File**: `src/components/reports/ReportsManager.tsx`
- **Plain**: Central reports dashboard with 5 tabs: Sales, Expenses, Customers, Financial, Inventory. Date range picker + global filters (supplier, category, store). Computes all data and distributes to sub-tabs.
- **Technical**: Reads all `state.sales`, `state.expenses`, `state.customers`, `state.products` for the date range. Computes massive derived data: filtered sales lists, expense lists, customer stats with spend, COGS per sale (via `getItemCOGS` from services), profit calculations, wallet method breakdowns, category aggregations, top product rankings. Passes computed props to each tab.
- **Data reads**: `state.sales`, `state.expenses`, `state.customers`, `state.products`, `state.suppliers`.
- **Data writes**: None (read-only analytics).
- **Props**: `onNavigate`.
- **Sub-tabs**: SalesReport, ExpensesReport, CustomersReport, FinancialReport, InventoryReport (which wraps InventoryReportManager from inventory).
- **Links to**: InventoryReportManager.

---

## 12. USERS / PERMISSIONS — Route: `'users'`

### UserManager — User List
- **Route**: `'users'` (admin only)
- **File**: `src/components/users/UserManager.tsx`
- **Plain**: All system users listed. Add/Edit/Delete. Role badges, active/inactive status. Cannot delete own account.
- **Technical**: Reads `state.users`. Cards with avatar, name, role badge, status, email. Search. Delete (except self) with confirmation. Toggle active/inactive. Add/Edit via UserModal.
- **Data reads**: `state.users`, `profile`.
- **Data writes**: `DELETE_USER`.
- **Links to**: UserModal.

### UserModal — Create/Edit User + Permissions
- **File**: `src/components/users/UserModal.tsx`
- **Plain**: Form for creating/editing a user. Role selection (admin/manager/cashier) determines base permissions. Granular permission toggles for specific capabilities.
- **Technical**: Role-aware permission sets. Roles: admin (all), manager (most), cashier (limited). Granular perms: canEditPrice, canGiveDiscount, canDeleteSale, canViewProfit, canManageStock, canManagePO, canViewRecords, access_inventory, access_expenses, access_customers, access_reports. Avatar upload with compression. Password field for new users.
- **Data reads**: `state.currentUser`.
- **Data writes**: `SET_USER`, `UPDATE_USER`. Creates auth user via `adminSupabase`.
- **Props**: `isOpen`, `onClose`, `user`.

---

## 13. SETTINGS — Route: `'settings'`

### Settings — Main Settings Page
- **Route**: `'settings'`
- **File**: `src/components/settings/Settings.tsx`
- **Plain**: Full app settings with 5 tabs: General, Receipt, Backup, Security, Database. Manage store info, currency, language, sound, keyboard shortcuts, receipt design, backup/restore, sync settings, export/import data.
- **Technical**: Reads/writes `state.settings`. Uses `settingsService.update()` for instant cloud sync on each change (debounced for some fields). Tab navigation.
- **Tabs**:
  - **General**: Store name, address, phone, email, currency, language, sound on/off, keyboard shortcuts, interface mode (touch/keyboard), pos-grid-columns, tax rate, sale type toggles (retail/wholesale/estore), default sale type.
  - **Receipt**: All receipt design options (paper size, logo, show/hide fields, templates, font scale/weight, padding, offsets, barcode, tax display, customer info, footer text, auto-print, printer type).
  - **Backup**: Create/restore/delete browser cache backups. Physical PC backup via File System Access API.
  - **Security**: Cloud sync toggles (auto-push, auto-pull, big-inventory mode, manual sync), password change, pending ops display.
  - **Database**: Export/import per-table JSON, purge local data, seed missing barcodes, stock integrity audit.
- **Data reads**: `state.settings`, `state.products` (for integrity check).
- **Data writes**: `SET_SETTINGS` (frequent), calls settingsService.update().
- **Child components**: BackupTab, CloudSyncTab, DatabaseTools, PasswordChange, ReceiptPreview, LogoUpload.

### ReceiptPreview — Live Receipt Preview
- **File**: `src/components/settings/ReceiptPreview.tsx`
- **Plain**: Live preview of receipt design based on current settings. Updates in real-time as settings change.
- **Technical**: Uses sample sale data to render receipt preview. Shows paper size, padding, logo, fields, font scale, QR codes. Changes as settings are adjusted.
- **Data reads**: `state.settings`.

### LogoUpload — Store Logo Upload
- **File**: `src/components/settings/LogoUpload.tsx`
- **Plain**: Drag-and-drop or click-to-upload store logo. Auto-compresses to WebP ~20-50KB.
- **Technical**: Uses canvas compression. Reads file, compresses, converts to data URL. Calls `onLogoChange` callback or updates settings.

### BackupTab — Backup/Restore
- **File**: `src/components/settings/BackupTab.tsx`
- **Plain**: Create database backups (download as JSON), restore from backup file, delete existing backups.
- **Technical**: Reads all data from localDb (all tables). Packages as JSON. Restore parses and writes back. Physical PC backup via File System Access API (showDirectoryPicker).

### CloudSyncTab — Sync Settings
- **File**: `src/components/settings/CloudSyncTab.tsx`
- **Plain**: Toggle auto-sync on/off. Set manual sync mode. View pending operations. Force sync now button.
- **Technical**: Toggles `settings.autoSync`, `settings.manualSync`, `settings.bigInventory`. Calls `syncNow()`, `retrySyncAll()`.

### DatabaseTools — Data Management
- **File**: `src/components/settings/DatabaseTools.tsx`
- **Plain**: Advanced tools: export any table as JSON, import JSON into any table, purge all local data, seed missing barcodes, run stock integrity check.
- **Technical**: Per-table export/import (products, sales, customers, etc.). Purge clears all IndexedDB. Seed barcodes generates missing barcodes for products. Integrity check runs `auditStockIntegrity()`.

### PasswordChange — Update Password
- **File**: `src/components/settings/PasswordChange.tsx`
- **Plain**: Change current user's password. Current password + new password + confirm.
- **Technical**: Calls `useAuth().updatePassword()`.

---

## 14. COMMON / SHARED COMPONENTS

### Modal
- **File**: `src/components/common/Modal.tsx`
- **Plain**: Generic modal with backdrop, escape-to-close, configurable max width. Used everywhere.
- **Props**: `isOpen`, `onClose`, `title`, `subtitle`, `footer`, `maxWidth`, `children`.

### ModernModal
- **File**: `src/components/common/ModernModal.tsx`
- **Plain**: Improved centered modal with safe-area-aware padding, overflow-y-auto, no cropping on mobile.
- **Props**: Same as Modal but with `className` override.

### DialogProvider
- **File**: `src/components/common/DialogProvider.tsx`
- **Plain**: Global dialog system for confirm/delete/input/loading modals. Renders via portal.
- **Technical**: Listens for `dialog` custom events. Renders appropriate modal type. Supports async confirm/cancel pattern.

### SearchableSelect
- **File**: `src/components/common/SearchableSelect.tsx`
- **Plain**: Autocomplete dropdown with search input, keyboard navigation, dynamic positioning, "add new" option.
- **Props**: `options`, `value`, `onChange`, `placeholder`, `icon`, `label`, `align`, plus advanced options for create-as-you-type.

### CameraScanner
- **File**: `src/components/common/CameraScanner.tsx`
- **Plain**: QR/barcode scanner using device camera. Supports torch, camera switching, multiple scan modes.
- **Technical**: Uses `html5-qrcode` library. Modes: fast, industrial, all. Returns scanned code via `onScan` callback.
- **Props**: `onScan`, `onClose`, `mode`.

### BarcodePreview
- **File**: `src/components/common/BarcodePreview.tsx`
- **Plain**: Renders a barcode as SVG using JsBarcode. Inline or full-size.
- **Props**: `value`, `inline`, `scale`.

### HelpTooltip
- **File**: `src/components/common/HelpTooltip.tsx`
- **Plain**: Floating help tooltip that appears on hover/click. Auto-positions around trigger element.
- **Technical**: Renders via portal. Closes on scroll/click outside.

### TouchKeyboard
- **File**: `src/components/common/TouchKeyboard.tsx`
- **Plain**: Full on-screen virtual keyboard for touch devices. QWERTY, numeric, symbol layouts. Calculator mode. Simulates DOM input events.
- **Technical**: Connects to DOM input elements. Supports caps lock, sound feedback, multiple layout modes.

---

# 🔄 FLOW MAPS

---

## Flow 1: Product Lifecycle (Create → Stock → Sell → Report)

1. **Create Product**: InventoryManager → `ProductModal` → form fields → `productsService.create()` → Supabase + localDb → dispatch `ADD_PRODUCT` → visible in product list.
2. **Add Stock**: InventoryManager → `BatchStockInSystem` → search products → set qty/cost/retail/supplier → commit → creates purchase records + product batches + updates `product.stock` + logs stockHistory → dispatch `UPDATE_PRODUCT` + `ADD_PURCHASE_RECORD`.
3. **Sell at POS**: POSTerminal → ProductGrid → select product → add to Cart → CheckoutPage → payment → `salesService.create()` → deducts stock per item (`product.stock -= qty`, batch `qty_remaining -= qty`) → logs stockHistory (type: 'sale') → dispatch `ADD_SALE` → receipt printed.
4. **View in Reports**: ReportsManager → InventoryReport → per-product KPIs (revenue = sum of sale subtotals, COGS = sum of batch costs, profit = revenue - COGS, margin %).
5. **Restock trigger**: PurchaseOrderSystem → Auto mode finds products where `stock < minStock` → generates PO → "Admit All" converts to stock-in.

---

## Flow 2: Complete Sale (Cart → Payment → Receipt)

1. **Add items**: POS → ProductGrid → click product → (optional) ProductOptionsModal for variants → addToCart → appears in Cart.
2. **Manage cart**: Update quantities, apply per-item discounts, edit prices, select customer, apply bill discount.
3. **Checkout**: Click Checkout → CheckoutPage opens.
4. **Select payment**: Cash/Card/Bank Transfer/Credit/Split. Enter amount or use Exact/Quick amounts.
5. **Complete**: Click Complete Payment → validates credit limits → `salesService.create(sale)` → writes to localDb + sync queue → dispatches `ADD_SALE` → clears cart → ReceiptPrint opens.
6. **Receipt**: Print (auto or manual), share as image/PDF, send via WhatsApp, or close.
7. **Sale record**: Appears in TransactionsManager immediately.

---

## Flow 3: Return / Refund

1. **Find sale**: TransactionsManager → search/filter → click sale row → opens sale detail modal.
2. **Process refund**: Click Refund → confirmation dialog → for each item: creates stockHistory (type 'sale_return') → adds stock back (`product.stock += qty`) → original sale is deleted or flagged.
3. **Inventory updated**: Product stock restored, stockHistory logged.
4. **Report impact**: Sale removed from revenue calculations. Stock-in appears in purchase records (as negative).

---

## Flow 4: Barcode → Scan → Match → POS

1. **Generate barcode**: InventoryManager → select products → BarcodeGenerator → configure layout → Print.
2. **Physical label**: Printed and attached to product.
3. **Scan at POS**: Hardware scanner → `POSTerminal.handleScan(barcode)` OCR-normalizes → `productsService.getByBarcode()` → exact match → `addToCart(product)`.
4. **Camera scan**: ProductGrid → Camera button → CameraScanner → scans via `html5-qrcode` → same `handleScan(barcode)` flow.

---

## Flow 5: Customer Credit (Udhaar) → Credit Payment

1. **Set credit limit**: CustomerModal → set `creditLimit` field.
2. **Sell on credit**: POS → select customer → CheckoutPage → select "Credit" payment → validates `creditUsed + total <= creditLimit` → completes sale → customer's `creditUsed += total`.
3. **View credit**: CustomerDetailModal → shows `creditUsed / creditLimit`, credit history.
4. **Credit payment (Wasooli)**: CustomerDetailModal → Record Payment → enter amount → dispatches `UPDATE_CUSTOMER` (reduces `creditUsed`) → creates expense record (for cash tracking).
5. **Balance updated**: Customer profile shows reduced creditUsed next time.

---

## Flow 6: Supplier Purchase → Stock → Ledger

1. **Create supplier**: SupplierManager → SupplierModal → fields → `suppliersService.create()` → added to `state.suppliers`.
2. **Purchase order**: PurchaseOrderSystem → Auto/Manual → generate PO → "Admit All to Stock".
3. **Stock arrives**: BatchStockInSystem → same flow as "Admit All" → products' stock/cost/price updated, purchase records created.
4. **Record payment in ledger**: SupplierLedger → Record Payment → amount + method → ledger entry created → auto-expense created.
5. **View balance**: Supplier card shows computed balance. Ledger shows all transactions.

---

## Flow 7: User → Role → Permissions

1. **Create user**: UserManager → UserModal → select role (admin/manager/cashier) → additional granular perms → `adminSupabase.createUser()` → dispatch `SET_USER`.
2. **Permissions applied at**: App.tsx `renderCurrentView()` — restricts view access based on role + perms. Cart.tsx — restricts discount/price edit perms. Inventory — restricts stock/PO management.
3. **View in reports**: UserManager shows all users with role + active status.

---

# 🗄️ DATA LAYER (lib/)

| File | Purpose |
|------|---------|
| `services.ts` | All CRUD service classes (productsService, salesService, customersService, etc.) — wraps Supabase Management API calls |
| `localDb.ts` | IndexedDB via Dexie.js — all local tables (products, sales, customers, settings, bundles, discounts, stockHistory, productBatches, purchaseRecords, pendingOps, salesTabs) |
| `syncEngine.ts` | Background sync engine — pushes pendingOps to Supabase, pulls remote changes, merges into localDb |
| `currencies.ts` | Currency formatting (symbol, code, formatting) |
| `sonner.ts` | Toast notification wrapper around `sonner` library |
| `dialog.tsx` | Dialog system API for confirm/alert/input/loading |
| `sounds.ts` | Sound effect player (page transitions, clicks, payments) |
| `invoice.ts` | Invoice number generation |
| `barcode.ts` | Barcode value generation (EAN-13, random) |
| `image.ts` | Image compression utility |
| `utils.ts` | Misc utilities |
| `useScroll.ts` | Scroll observation hook |
| `dateUtils.ts` | Date formatting |

---

# 🧠 STATE MANAGEMENT (context/)

| Context | File | Stores |
|---------|------|--------|
| `AuthContext` | `src/context/AuthContext.tsx` | `user`, `profile`, `loading`, `isRecoveringPassword`, `signIn`, `signOut`, `signUp`, `resetPassword`, `updatePassword` |
| `SupabaseAppContext` | `src/context/SupabaseAppContext.tsx` | `cart`, `products`, `sales`, `customers`, `settings`, `bundles`, `discounts`, `suppliers`, `users`, `expenses`, `purchaseRecords`, `salesTabs`, `activeSalesTab`, `selectedCustomer`, `currentUser`, `categories`, `loading`, `syncProgress` |
| `TouchKeyboardProvider` | `src/providers/TouchKeyboardProvider.tsx` | `isKeyboardOpen` |

---

# 🏗️ ARCHITECTURE NOTES

- **No React Router**: Uses a custom `currentView` state + `switch` statement in `App.tsx`. Views are toggled via `onViewChange` callback or `navigate` custom event.
- **Lazy loading**: All page-level components except POSTerminal are lazy-loaded with `React.lazy()` + `Suspense`.
- **Offline-first**: All data reads primarily from localDb (IndexedDB via Dexie.js). Writes go to localDb first, then sync to Supabase via background syncEngine.
- **Sync engine**: `syncEngine.ts` manages a pending operations queue. Auto-push every 30s. Pull on login + periodically. Manual sync button in settings.
- **Currency**: Single currency per shop (set in settings). All monetary values use `formatCurrency(value, currencyCode)`.
- **i18n**: Custom `useTranslation` hook with hardcoded fallback strings. Primary language is English.
- **RBAC**: Role-based (admin/manager/cashier) + granular permission flags. Enforced at route level (App.tsx) and UI level (conditional button rendering).

---

# ⚠️ GAPS / SUSPECTED BUGS / INCOMPLETE FLOWS

### Dead / Possibly Dead Code
1. **CheckoutModal vs CheckoutPage**: Both exist with near-identical functionality. CheckoutModal has `dcNumber` + `otherAmount` fields; CheckoutPage has `extraCharges`. Only `CheckoutPage` is used from POSTerminal. CheckoutModal is imported by TransactionsManager for bill edit. May be consolidatable.
2. **ActionHistory vs AuditTimeline**: Both show stock history. ActionHistory fetches from server; AuditTimeline reads localDb. Purpose overlap — one may be unused.

### Inventory / Stock
3. **SupplierLedger only shows manual entries**: The ledger loads via `suppliersService.getLedger()` which appears to only include manually recorded bills/payments. Purchase orders and stock-in records from `PurchaseOrderSystem` / `BatchStockInSystem` are NOT automatically linked to the supplier ledger. Supplier balance shown on SupplierManager cards uses `suppliersService.getMultipleBalances()` which may compute differently.
4. **PurchaseOrderSystem "Admit All" duplicates BatchStockInSystem logic**: Both create purchase records + update stock + log history. The PO "Admit All" may have different audit trail than direct stock-in.
5. **Stock history retention**: `ActionHistory` mentions "last 300 entries" retention. No automatic cleanup found — old entries may accumulate indefinitely in localDb.

### POS / Cart
6. **Bundle quantity update fallback**: `updateBundleQuantity` in Cart.tsx has a fallback path when bundle definition is not found in `state.bundles`. This fallback uses `Math.round(item.quantity * ratio)` which could produce incorrect quantities for multi-item bundles with different base quantities.
7. **Cart header deal count**: The deal count shown in the header is the number of unique bundle IDs. If the same bundle is added twice (as two separate groups), they'd be counted as one deal. Currently no support for multiple instances of the same bundle in cart.
8. **Free gift promotions**: `freeGifts` is computed by `useCartCalculations` but the actual mechanism for auto-adding free gifts to cart was not found. The free gift display appears in Cart.tsx summary but the free gift items may not be in the cart.

### Data Integrity
9. **Stock integrity gaps**: `InventoryReportManager` runs an integrity check comparing `products.stock` vs `product_batches.qty_remaining` vs `SUM(stock_history.change_qty)`. Discrepancies are detected but no auto-repair mechanism exists.
10. **Bill edit atomicity**: During bill edit, the old sale is deleted and a new one created. If the app crashes between delete and create, the sale is lost. The code attempts two-phase but relies on sequential async operations.

### Sync / Offline
11. **Conflict resolution**: No client-side conflict resolution was found. If the same record is modified on two devices, the last sync wins (last-write-wins). No merge strategy.
12. **Large inventory sync**: `bigInventory` setting exists but implementation unclear. May skip or throttle initial sync for large datasets.
13. **Pending ops growth**: `pendingOps` queue has no size limit. If sync fails persistently, the queue could grow unbounded.

### Features / Missing
14. **No customer statement PDF**: CustomerDetailModal shows transaction list but there's no export to PDF for customer statements.
15. **No batch-level expiry tracking**: Product batches have `createdAt` but no `expiryDate` field was found. Cannot track expiring inventory.
16. **No multi-currency support**: Single currency per shop. No exchange rate or multi-currency transaction support.
17. **No purchase order status tracking**: POs are generated and admitted but there's no "pending/partial/received" status tracking.
18. **No email receipt**: WhatsApp and print are supported but not email. No SMTP/mail integration.

### UI / UX
19. **Mobile bottom nav limited**: Shows only 4-5 items. Some views (suppliers, purchase-orders, users) are not reachable from mobile bottom nav — must use Header menu.
20. **TouchKeyboard integration**: The virtual keyboard component exists but its integration across all input fields was not verified. May not activate on all text inputs.

### Security
21. **Settings page unrestricted**: `Settings` route (`case 'settings'`) returns `<Settings />` for ALL authenticated users with no role check. Cashiers could potentially access and modify store settings.
22. **Admin operations in UserModal**: User creation calls `adminSupabase.createUser()` which requires `service_role` key. If the key is exposed in client-side code, this is a security risk.

---

*End of Project Map — 2026-07-07*
