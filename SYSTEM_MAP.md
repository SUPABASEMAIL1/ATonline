# Phase 1: High-Level Architecture & Specifications

## SYSTEM MAP — ZaynahsPOS (Universal POS v12)

### 0. 🛡️ SYSTEM-WIDE MANDATORY RULES (ANTI-AI BREAKABLE UI)
**CRITICAL RULE FOR ALL DEVELOPERS AND AI AGENTS:** 
- **Use Shared Modules EVERYWHERE:** You MUST use existing shared modules (`src/shared/*` or `src/components/common/*`) for all UI elements. 
- **NO Custom Implementations:** NEVER build separate, page-specific versions of buttons, icons, popups, media selection libraries, drag-and-drop lists, search bars, etc. 
- **Visual Consistency:** If a popup, button, or icon looks and behaves a certain way in one place, it MUST be exactly the same in all other places using the shared library.
- **Modern Standards:** Always use the shared libraries (e.g., `<MediaLibrary>`, `<Modal>`, `<Button>`, shared drag-and-drop components) across the ENTIRE system. Do NOT inject custom SVGs or ad-hoc UI primitives.

### 1. Architecture & Global State

- **Framework:** React + TypeScript + Vite + React Router v6.
- **Data layer:** Local-first. IndexedDB via Dexie (`src/lib/localDb.ts`), synced to Supabase Postgres through a queue (`localDb.pendingOps`) driven by `src/lib/syncEngine.ts`. Provided to the whole app through `SupabaseAppContext` (`useApp()`).
- **Global state shape** (`AppState`, `src/context/SupabaseAppContext.tsx:49-93`):
  - `products`, `customers`, `sales`, `users`, `discounts`, `cart`, `currentUser`, `settings`, `selectedCustomer`, `salesTabs`, `activeSalesTab`, `billDiscountValue`, `billDiscountType`, `expenses`, `purchaseRecords`, `categories`, `suppliers`, `purchaseOrders`, `supplierTransactions`, `payments`, `stockHistory`, `variantStockHistory`, `productAddons`, `salesmen`, `bundles`, `notes`, `storeOrders`, `editingSaleId`, `editingStoreOrderId`, `inventoryActiveTab`, `inventoryActiveCategory`, `lastProductHubId`, `pendingReturnTab`, `pendingReturnSaleId`, `pendingSearch`, `inventoryPurchasesPage`, `loading`, `error`, `syncProgress`.
- **Settings singleton:** Always `id = '00000000-0000-4000-8000-000000000001'` (`SETTINGS_ID`). Mapped via `mapSettings()` (prioritizes Supabase snake_case). Persisted through `settingsService.update` → Dexie `appSettings.put` + `queueOp('app_settings','update')` + `dispatch SET_SETTINGS` + background `syncNow()`.
- **Sync engine** (`startSyncEngine`, `src/lib/syncEngine.ts:999`):
  - Runs on app boot (`App.tsx:227-252`).
  - Retention jobs on startup + hourly: `pruneExpiredCancelledOrders()` (24h expiry for `status='cancelled'`, cleans local + remote), `pruneOldStockHistory()` (90-day expiry + 5000-record local cap).
  - Pushes pending local ops to Supabase; pulls cloud changes; respects F17/F18/F19/F20/F21 (queue merge, realtime conflict guards, no-cache-wipe on fetch failure, no silent op drops, stale-write guards via `guard_stale_write_*`).
  - Note: realtime `supabase.channel(...)` is configured in `src/lib/supabase.ts:16`; `localDb` uses `isPendingDelete`/`isPendingChange` guards so realtime updates don't clobber pending local edits.
- **Cross-cutting providers:**
  - `DialogProvider` / `src/lib/dialog.tsx` — global confirm/alert/prompt (`sonner` wrapper used everywhere as toast + confirm).
  - `TouchKeyboardProvider` — on-screen keyboard for touch mode.
  - `OfflineBanner` (`OfflineBadge.tsx`) — online/offline indicator in the shell.
  - `SkeletonLoader` — required loading state for route/layout switches.
  - `Toaster` (sonner) — top-center toasts with brand styling.

---

### 1. TOP-LEVEL ROUTE INVENTORY

| Route | Page | Component | Access | Primary Tables |
|---|---|---|---|---|
| `/pos` | POS / Checkout | `POSTerminal` | All authed users | products, customers, bundles, discounts, sales, sales_tabs, store_orders |
| `/dashboard` | Dashboard | `DashboardManager` | All | sales, products, customers, suppliers |
| `/online-orders` | Online Orders | `OnlineOrdersPage` | All (only if `estoreEnabled`) | store_orders |
| `/transactions` | Transactions/Sales | `TransactionsManager` | All | sales, payments, customers, stock_history, users, salesmen |
| `/expenses` | Expenses | `ExpenseManager` | All | expenses, users |
| `/inventory` | Inventory (redirect) | → `/inventory/products` | All | products, categories, bundles, suppliers, purchase_records, stock_history |
| `/inventory/:subTab` | Inventory sub-tabs | `InventoryManager` | All | (see Inventory section) |
| `/customers` | Customers | `CustomerManager` | All | customers, sales, payments |
| `/reports` | Reports (redirect) | → `/reports/sales` | All | sales, expenses, payments, products, customers, salesmen, suppliers |
| `/reports/:subTab` | Reports sub-tabs | `ReportsManager` | All | (see Reports section) |
| `/discounts` | Discounts | `DiscountManager` | All | discounts |
| `/users` | Users (BLOCKED) | `UsersPage` | **REDIR /pos** | (inaccessible) |
| `/settings` | Settings (redirect) | → `/settings/general` | All | app_settings |
| `/settings/:subTab` | Settings sub-tabs | `Settings` | All | app_settings |
| `/suppliers` | Suppliers | `SupplierManager` | All | suppliers, supplier_transactions, expenses, purchase_records, products |
| `/purchase-orders` | Purchase Orders (Restock) | `PurchaseOrderSystem` | All | (see Inventory/Restock + orphaned purchase_orders) |
| `/store` | Store front-end (public) | `EStoreApp` | Public (if `estoreEnabled`) | store_orders, products, categories, bundles, customers |
| `/store/checkout` | Store checkout | `StoreCheckout` | Public | store_orders, customers |
| `/store/track?id=` | Order tracker | `OrderTracker` | Public | store_orders |
| `/` | Root redirect | `RootRedirect` | All | — |
| `*` | Fallback | `<Navigate to="/pos" />` | — | — |

**Navigation items in Header** (`Header.tsx:161-184`): Dashboard, POS, Orders (only if `estoreEnabled`), Sales (Transactions), Expenses, Inventory, Customers, Discounts, Reports, Suppliers. Settings + Logout are in the right-controls/user section. **Users never appears** (blocked).

**MobileBottomNav** (`MobileBottomNav.tsx`): Home (dashboard), POS, Sales (transactions), Stock (inventory), Clients (customers), + a "More" menu button that opens the full drawer (which contains all nav items + Theme + Settings + Logout).

---




This document serves as an exhaustive, page-by-page technical blueprint for building a local-first, cloud-synchronized retail and e-commerce Point of Sale (POS) system.

### 1. System Architecture & Global State
#### 1.1 Technology Stack
- **Frontend Framework:** React 18+ with TypeScript, Vite (build tool), and React Router v6 for routing.
- **Local Database:** IndexedDB wrapped with Dexie.js (`src/lib/localDb.ts`) to manage all state locally, allowing seamless offline operations.
- **Cloud Backend:** Supabase Postgres for cloud storage, user authentication, and realtime websocket events.
- **State Management:** React Context API via `SupabaseAppContext` (`useApp()`) serving as a reactive global state layer.

#### 1.2 Database Schema (Dexie & Supabase Tables)
To build this database, implement the following relational entities:

- **products:** Master catalog with fields `id` (UUID), `name`, `sku`, `barcode`, `price`, `cost`, `trackInventory`, `stock` (real-time balance), `minStock`, `targetStock`, `productType` ('simple' or 'variable'), `variantData` (array of child variant objects), `categoryId`, `supplierId`, `isService`, `requireSerial`, and `metadata`.
- **sales:** Completed invoices. Contains `id`, `invoiceNumber`, `customerId`, `cashierId`, `salesmanId`, `saleType` ('retail', 'wholesale', 'estore'), `paymentMethod` ('cash', 'card', 'digital'), `items` (JSON array of line-items), `subtotal`, `discountAmount`, `taxAmount`, `deliveryCharges`, `total`, `receivedAmount`, `changeDue`, `refundedAmount`, `status` ('completed', 'refunded'), `notes` (e.g. 'DRAFT_SALE'), and `createdAt`.
- **store_orders:** E-Store orders. Includes `id`, `invoiceNumber`, `customerId`, `status` ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'converted', 'cancelled'), `items` (JSON), `subtotal`, `deliveryFee`, `discount`, `tax`, `total`, `fulfillmentMode` ('delivery', 'pickup'), `notes`, `seen` (boolean), and `fulfilledSaleId`.
- **payments:** Logs of payments. Includes `id`, `customerId`, `amount`, `paymentMethod`, `direction` ('in', 'out'), `notes`, and `createdAt`.
- **expenses:** Expenditure tracking. Fields: `id`, `description`, `amount`, `category` (Supplies, Bills, Rent, Staff, Marketing, Repair, Other), `paymentMethod` (cash, card, digital), `channel` (General, Retail, Wholesale, Estore), `isManualOverride`, `createdAt`, `addedBy`.
- **suppliers & supplier_transactions:** Supplier records and billing balances (accounts payable).
- **discounts:** Promo database. Fields: `id`, `name`, `type` (percentage, fixed, bogo, free_gift, mix_and_match), `value`, `minAmount`, `maxDiscount`, `validFrom`, `validTo`, `validDays` (array of active days), `conditions` (JSON criteria list), `isAutoApply`, `isActive`.
- **stock_history & variant_stock_history:** Logs every single inventory movement with `qtyChange`, `type` ('sale', 'return', 'stock_in', 'adjustment'), and `userId`.

#### 1.3 Synchronization Engine (`syncEngine.ts`)
The sync engine connects local IndexedDB to Supabase:
- **Pending Queue (`localDb.pendingOps`):** Any insert, update, or delete operation is written to IndexedDB first, and a record of the change is appended to `pendingOps`.
- **Continuous Push/Pull:** A loop reads `pendingOps`, pushes them sequentially to Supabase endpoints, deletes them on success, and fetches updated remote records to merge into local tables.
- **Conflict Prevention:** Local records use `isPendingDelete` and `isPendingChange` flags. The Supabase Realtime channel updates bypass local fields if these flags are active, avoiding clobbering un-synchronized edits.
- **Automatic Retention Jobs:**
  - `pruneExpiredCancelledOrders()`: Executed at boot and hourly. Automatically purges all cancelled store orders older than 24 hours from both local and cloud databases.
  - `pruneOldStockHistory()`: Keeps local database footprint light. Purges local stock history older than 90 days and caps total local history items at 5000 records.

---

### 2. Page-By-Page Functional Specification

#### 2.1 POS Terminal & Checkout (`/pos`)
The primary interface for customer billing and returns.
- **Layout:** split screen with the Product Grid/Search on the left (or middle) and the active shopping cart on the right (collapsible into a bottom drawer on mobile viewports).

**Header Controls:**
- **Multi-Tab system:** Manages up to 3 active sales transactions (Tab 1, Tab 2, Tab 3) concurrently. Cashiers can switch tabs seamlessly; each tab preserves its own independent cart, customer linkage, and totals.
- **Grid Density Controller:** Dynamic viewport adjustment button. Switches the product grid layout from Auto down to manual column densities (1 to 8 columns), saving the state locally to `settings.posGridColumns`.
- **Product Sort Button (STORE SORT MIRROR):** A `Sort` toggle (beside Grid Density) that enters **POS Product Sort Mode** — identical drag up/down behavior to `/inventory/store-sort` (uses shared `useDragDropList` + `DragHandle`). Order persisted per-category in `app_settings.pos_product_order` (`{ [categoryId|'all']: productId[] }`), applied to the grid on category switch. "Reset to Default" clears it. This keeps POS grid arrangement consistent with the storefront sort system. See GEMINI.md FEATURE PLAN.
- **Sale/Return Mode Switch:** Toggle switch. When toggled to Return Mode, every item subsequently added to the cart receives a negative quantity (-1). This converts the checkout process into an immediate refund/reversal settlement.

**Product Grid & Input Scanning:**
- **Autocomplete Search & Scanner input:** Features a single search bar. An autofocus listener automatically detects physical barcode scanner inputs (detects sequence length >= 3 characters with a 200ms debounce), instantly inserting matching items to the cart and clearing the input.
- **Category Chips:** Render categories dynamically. Standard chips are featured at the top, along with a static "Bundles & Deals" filter.
- **Camera Scanner Modal:** Activates a WebRTC device camera stream to decode standard retail barcodes.
- **Variables & Modifier Interceptors:** If an item has variants, customizable toppings, serial number requirements (IMEI/SN), or add-ons, clicking it opens the `ProductOptionsModal` instead of immediate cart insertion.

**Active Shopping Cart Panel:**
- **Drafts Portal (F7):** Opens the `DraftsModal`, displaying on-hold pending transactions (`DRAFT_SALE` status). Loading a draft sweeps the current cart and restores the saved state.
- **Customer Linkage:** Inline Searchable Select dropdown. Features a quick-add Customer form inline (Name, Mobile, Email). Displays the selected customer's lifetime billing totals.
- **Line Items Controls:** Supports per-item numeric quantity updates, custom price overrides, and discount percentages. Shows variant, modifier, and serial-number badges.
- **Bill-Level Summary:** Supports flat or percentage bill-level discounts. Tapping the promo icon launches the `PromotionModal`, presenting a list of active coupon campaigns.

**Checkout & Payment Settlement (`CheckoutPage.tsx`):**
- Triggered via the checkout button or keyboard shortcut F2. Displays order totals and collects payment profiles.
- **Sale Type:** Choose between Retail, Wholesale, or E-Store. Selecting E-Store dynamically appends delivery fees.
- **Payment Selection:** 3 active physical buttons: Cash, Card, and Digital (Bank Transfer). Cash input requires a value equal to or greater than the invoice total. Card and Digital allow 0 input validations (representing pre-authorized/card-swipe clearances).
- **Processing (`handlePayment`):** Submits the completed sale. Retrieves a structured invoice number using a remote RPC `get_next_invoice_number` (or defaults to a local sequential counter if offline). Saves the sale as 'completed', decrementing inventory balances across products and variants.
- **Receipt & Kitchen Tickets:** Success launches `ReceiptPrint` previews (A4, 80mm, or 58mm layouts) and sends print dispatches to KOT printers if `enableKotPrinter` is turned on.

#### 2.2 Dashboard (`/dashboard`)
The administrative operational center.

**KPI Stat Widgets (Drill-Down Links):**
- **Revenue Today:** Displays sum total sales today minus refunds. Click routes to `/reports/sales`.
- **Flow Monitor:** Displays daily velocity progress. Routes to `/reports/sales`.
- **Payables:** Sum of all outstanding supplier payables (negative balance). Routes to `/suppliers`.
- **Orders (Pending):** Active supplier purchase orders tracker. Routes to `/purchase-orders`.
- **Inventory (Low Stock):** Counter of products where real-time stock is less than or equal to `minStock` (fallback to 5). Transitions to warning rose colors if count > 0. Routes to `/inventory/products`.

**Analytics Visualization Charts:**
- **Business Pulse:** Area chart illustrating hourly revenues (last 12 hours). Calculates peak sales times dynamically.
- **Live Sales Feed:** A list tracking the last finalized transactions with timestamps, prices, and totals.

#### 2.3 Online Orders Portal (`/online-orders`)
Visible and operational only if `settings.estoreEnabled` is true.

**Order Grid Layout:**
- **Active Orders Tab:** Displays ongoing orders from the online store with pending, accepted, preparing, ready, or out-for-delivery status badges. Includes pulsing NEW badges for orders unread in local storage.
- **Past Orders Tab:** Shows delivered or cancelled order archives. Query limit is strictly capped at the latest 50 entries.

**Real-time Status Progression Drawer:**
- Selects an order, revealing customer contacts, geolocation coordinates with a Google Maps button, and billing items.
- **Core Action ("Accept & Load to POS"):** Bypasses the accepted transition, setting order status directly to preparing. Pushes the customer's cart directly into the current active POS terminal tab, adds any delivery fees to the POS cart, and marks `editingStoreOrderId` with the online order ID.
- **Core Action ("Cancel"):** Soft-cancels the order (cancelled status badge). The order remains visible until the 24-hour background cleanup job deletes it.

#### 2.4 Transactions Ledger (`/transactions`)
The sales history and refund console.

**Comprehensive Search Filters:**
Provides search by invoice number, customer name, salesman, or cashier. Includes filters for Sale Type (Retail, Wholesale, E-Store), Payment Method, and Date Presets (Today, Yesterday, Last 7 Days, This Month, Last Month, Custom).

**Transactions Table List:**
Presents a grid of completed sales. Clicking a row reveals full invoice metadata, delivery coordinates, payment splits, and items.

**Atomic Refund Engine (`RefundSaleModal`):**
- Triggered from the Transaction Detail view. Supports Full refunds only.
- **Execution (`salesService.returnSale`):** Executes an idempotent atomic transaction `refundSaleAtomic` on Supabase:
  - Registers the return entries in `stock_history` (type: 'return'), restoring items to physical inventory counts.
  - Updates the invoice state to `refunded` and updates `refundedAmount`.
  - Creates an outbound record in the `payments` logs with direction 'out', setting the payment method to match the original purchase method.
  - Subtracts the returned total from the customer's `totalPurchases` aggregate history.

#### 2.5 Expenses Manager (`/expenses`)
A ledger for business expenditures.

**Expenditures Form (`ExpenseModal`):**
Collects Expense Description, Amount, Expense Date, Category (Select from a fixed set of constants: Supplies, Bills, Rent, Staff, Marketing, Repair, Other), Payment Method, and administrative notes.
**Accounting Outputs:**
Presents total filtered monthly expenditures and identifies the top expenditure category.
(Note: Recording supplier payments inside `/suppliers` automatically registers an expense item categorized under 'Supplies').

#### 2.6 Inventory sub-tabs (`/inventory/:subTab`)
The master inventory control manager split across 7 sub-tabs:

**A. Products (`/inventory/products`)**
- **Catalog view:** Displays active items with stock gauges.
- **CRUD Modal:** Add or edit standard simple items or variable products with multiple variants. Supports categories, suppliers, SKU generation, barcode printing coordinates, and images. Includes a toggle to mark items as Services (which disables stock tracking) or Serialized (which requires IMEI/SN input at POS checkout).
- **Product Detail Hub:** A sliding drawer showing stock levels, active modifiers, and historical movement ledgers. Supports quick manual adjustments (positive/negative stock edits) with logged audit reasons.

**B. History (`/inventory/history`)**
An incoming stock and purchase ledger. Clicking Add Stock In opens the `BatchStockInSystem` modal to log bulk stock-in entries from suppliers, updating cost and retail pricing scales.

**C. Restock (`/inventory/restock`)**
- **Auto Reorder mode:** Compares current stock against `minStock` or `targetStock`, generating an automatic deficiency purchase order list with editable quantities and costs.
- **Manual Restock mode:** Allows searching and adding any product catalog item into a custom purchase list.
- **Submission ("Commit & Add to Stock"):** Fires `commitStockInToInventory`, updating products, appending to `stock_history`, and optionally generating a supplier ledger bill.

**D. Bundles & Deals (`/inventory/bundles`)**
- **Fixed Bundles:** Combines specific items (e.g. 3 shirts) to sell at a flat discount.
- **Slot-Based Combos:** Creates slot choices (e.g. "Pick 1 Drink + Pick 2 Snacks"). Configures slot sizes, additional topping pricing, active repeating schedule calendars, and daily valid timeframes.

**E. Groups (`/inventory/groups`)**
A read-only table displaying active categories, item counts, total stock balances, and overall category monetary valuations.

**F. Media (`/inventory/media`)**
A centralized image library. Features automatic client-side WebP image compression, restricting image sizes to <= 50KB to optimize loading speeds.

**G. Store Sort (`/inventory/store-sort`)**
Allows drag-and-drop sequencing of items, categories, and active deals. Configures how they are displayed on the public storefront catalog.

#### 2.7 Suppliers Ledger (`/suppliers`)
Supplier accounts and bills payable tracker.

- **Supplier Directory:** Tracks supplier profiles, tax NTN registration numbers, and total outstanding payables.
- **Supplier Ledger Modal:** Displays a comprehensive Statement of Account with credit and debit balances.
- **Record Bill:** Manually increases supplier outstanding liabilities.
- **Record Payment:** Logs payments to the supplier, automatically generating a corresponding transaction row in the `/expenses` ledger under the 'Supplies' category.

#### 2.8 Customers Database (`/customers`)
Maintains customer profiles.

- **Client Directory:** Tracks name, mobile, email, billing addresses, and preferred pricing tier (Retail vs Wholesale).
- **Customer Detail Modal:** Allows deep dive into lifetime purchase history.

#### 2.9 Discounts & Promotions (`/discounts`)
Administrative console for managing POS store promotion campaigns.

- **Promotional Rules Form (`DiscountModal`):** Collects Campaign Name, Coupon Rules Type (percentage, fixed amount, buy-one-get-one, free gift, mix and match slots), valid date boundaries, minimum basket totals, and maximum ceiling values.

#### 2.10 Settings Dashboard (`/settings/:subTab`)
The master system settings management suite split across 5 sub-tabs:

- **General:** Manages store identity (logo, name, phone, email, address), localization formats, default checkout pricing channels, and core feature toggles (E-Store toggles, Touch keyboard layouts, Extra delivery charges).
- **Online Store:** Configures home delivery radiuses, delivery fees, minimum checkout limits, shop operating hours, and custom payment instruction templates.
- **Receipt Design:** Features 15 visual template options, font weight configurations, padding offsets, and a real-time mock printable canvas.
- **Security:** Password reset dashboard for the active user.
- **Database:** Provides data backup management. Select from up to 24 local DB stores to download as a structured JSON backup file, or upload a JSON backup file to merge offline data.

#### 2.11 Public Store Front-End (`/store` - Public)
A responsive, mobile-first public web storefront.

- **Architecture:** Connects directly to the Supabase Cloud backend database to ensure real-time inventory balances and order tracking, bypassing local browser caches.
- **Public Catalog:** Features keyword product searches, category navigation carousels, active deal cards, and product modals to configure variant options.
- **Cart Drawer & Checkout:** Persists active items in `localStorage.estore_cart`. Collects customer delivery locations with coordinates. Provides options for Cash on Delivery or Custom payment routing. On placement, triggers the Supabase remote RPC `place_estore_order` to register the pending order and reserve stock.
- **Realtime Order Tracker (`/store/track?id=`):** Subscribes to real-time PostgreSQL updates on the placed invoice, showing a live status timeline (Pending -> Preparing -> Out for Delivery -> Delivered) and updating in real time as the merchant updates the status.

---

### 3. Dynamic Data Cascades (The "Blast Radius")
When an operational transaction is completed, state changes cascade across the system:

```text
                  [POS Checkout / Completed Sale]
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
[sales]                     [stock_history]            [products]
Writes invoice row          Logs stock_out             Decrements stock counts
Embeds payments             Logs variant_stock_out     Updates variant stock arrays

     ┌───────────────────────────┴───────────────────────────┐
     ▼                                                       ▼
[customers]                                             [store_orders]
Updates lifetime total purchases                         (If Online) Status -> "converted"
```

| Master Action | Directly Updated Entity | Cascading State Impacts |
|---|---|---|
| **POS Checkout Sale** | Inserts a new row to the local/remote `sales` tables. | Decrements stock levels in `products` and variant stock counters instantly. Increments the linked customer's lifetime purchase totals. Triggers real-time report recalculations across sales and profit margin charts. |
| **Sale Refund** | Updates `sales.status` to `refunded` and sets `refundedAmount`. | Generates a restoration log in `stock_history` (type: 'return'). Increments physical product and variant stock balances. Appends an outbound payment log with direction 'out' to cash accounts. |
| **Sale Modification (Invoice Edit)** | Deletes the old invoice record and inserts a newly modified invoice record. | Atomic execution: Creates the modified invoice first (deducting stock). If successful, deletes the old invoice (restoring its original stock). Includes automatic database rollback bounds to avoid stock double-counting if the edit fails. |
| **Stock-In Commitment** | Inserts a new row to the local/remote `purchase_records` tables. | Increments stock balances in `products` and logs entries in `stock_history` (type: 'stock_in'). If matched with a supplier profile, raises outstanding supplier payable balances. |
| **Supplier Repayment** | Appends a row in the local/remote `expenses` table under the 'Supplies' category. | Appends a debit transaction in `supplier_transactions`, reducing outstanding supplier payables. |
| **Accepting Online Order** | Sets the `store_orders` status to `preparing` via the Online Orders page. | Loads the online shopping cart items directly into the active POS terminal checkout tab for settlement. |

---


---

# Phase 2: UI Design System & Global Shell

## 3. GLOBAL SHELL (Layout, Auth, Context)

### Header (`src/components/layout/Header.tsx`)
- **Logo** (storeLogo or `/zaynahs-logo.svg`) + storeName + "ZAYNAHSPOS.COM".
- **Scrollable nav** (desktop): Dashboard, POS, Orders (if estore), Sales, Expenses, Inventory, Customers, Discounts, Reports, Suppliers. Left/right scroll arrows when overflowing. Active underline.
- **Right controls:** `SyncStatusBadge`; **Force Sync** (clears PWA caches + sessionStorage + reloads); **Theme Toggle** (dark/light, persists `localStorage.theme` + `settingsService.update`); **User section** (name/@username/role + Avatar) → click opens mobile drawer on mobile, or direct Settings/Logout on desktop. Settings (⚙) + Logout on desktop.
- **Mobile drawer:** user card, nav grid (3 cols), System & Account (Theme, Settings, Logout), version "POS v12.0".

### MobileBottomNav (`MobileBottomNav.tsx`)
- Home (dashboard), POS, Sales (transactions), Stock (inventory), Clients (customers) + "More" (opens full drawer). Visible `md:hidden`.

### Auth (`src/context/AuthContext.tsx`, `LoginPage.tsx`, `ResetPasswordPage.tsx`)
- `useAuth()` → `{ user, loading, isRecoveringPassword, signOut }`.
- **LoginPage:** email + password → auth flow; error handling; link to reset password. `state.currentUser` set + `active` flag checked in `App.tsx` (if `!user || !currentUser || !currentUser.active` → LoginPage).
- **ResetPasswordPage:** password recovery flow (intercepted when `isRecoveringPassword`).

### Context (`SupabaseAppContext`)
- Global `AppState` (see §0). `loadData` loads all slices; `forceSync`; `dispatch` actions (ADD/UPDATE/DELETE for each entity, SET_SETTINGS, SET_CART, SET_EDITING_SALE_ID, UPDATE_SALES_TAB, etc.).
- This is the cross-page data hub — every page reads/writes through it.

### Dialog / Toast / Keyboard / Offline / Skeleton
- `DialogProvider` + `src/lib/dialog.tsx` — global confirm/alert/prompt (wraps `sonner`).
- `TouchKeyboardProvider` — on-screen keyboard (touch mode).
- `OfflineBanner` — online/offline indicator.
- `SkeletonLoader` — required loading state for route/layout switches.

---

## 0. APP SHELL / NAVIGATION / AUTH

### 0.1 Top-Level Routing — `src/App.tsx:368-388`
All authenticated routes render inside `<Header>` + `<main>` + `<MobileBottomNav>`. Every route wrapped in `<RequireAccess viewId=...>` (`App.tsx:95-105`). RBAC is **removed** — only `users` route is blocked (redirects to `/pos`).

| Route `(R)` | Component | Lazy | Notes |
|---|---|---|---|
| `/pos` | POSTerminal | No | `App.tsx:369` |
| `/online-orders` | OnlineOrdersPage | Yes | only if `estoreEnabled` else → `/pos` `:370` |
| `/transactions` | TransactionsManager | Yes | `:371` |
| `/expenses` | ExpenseManager | Yes | `:372` |
| `/inventory` → `/inventory/products` | InventoryManager | Yes | `:373-374` |
| `/inventory/:subTab` | InventoryManager | Yes | `:374` |
| `/customers` | CustomerManager | Yes | `:375` |
| `/reports` → `/reports/sales` | ReportsManager | Yes | `:376-377` |
| `/reports/:subTab` | ReportsManager | Yes | `:377` |
| `/discounts` | DiscountManager | Yes | `:378` |
| `/users` → `/users/staff` | UsersPage | Yes | `:379-380` |
| `/users/:subTab` | UsersPage | Yes | `:380` |
| `/settings` → `/settings/general` | Settings | Yes | `:381-382` |
| `/settings/:subTab` | Settings | Yes | `:382` |
| `/suppliers` | SupplierManager | Yes | `:383` |
| `/purchase-orders` | PurchaseOrderSystem | Yes | `:384` |
| `/dashboard` | DashboardManager | Yes | `:385` |
| `/` | RootRedirect | — | restores `localStorage.pos_current_view` else `/pos` `:108-122` |
| `*` | → `/pos` | — | `:387` |

- Route persistence: `pos_current_view` saved to localStorage on path change `:134-139`.
- Global `navigate` CustomEvent `:215-224` lets any component navigate via `window.dispatchEvent(new CustomEvent('navigate',{detail:'pos'}))`.

### 0.2 Desktop Header Nav — `src/components/layout/Header.tsx`
`getNavigationItems()` `Header.tsx:161-182`. Scrollable pill buttons `:232-252`, `navigate('/'+item.id)`, active = `/<id>`.

| Label (H) | Route | Icon | Line |
|---|---|---|---|
| Dashboard | `/dashboard` | dashboard | `:166` |
| POS | `/pos` | pos | `:167` |
| Orders | `/online-orders` | Bell | `:170` (only if `estoreEnabled`) |
| Sales | `/transactions` | sales | `:173` |
| Expenses | `/expenses` | expenses | `:174` |
| Inventory | `/inventory` | inventory | `:175` |
| Customers | `/customers` | customers | `:176` |
| Discounts | `/discounts` | discounts | `:177` |
| Reports | `/reports` | reports | `:178` |
| Suppliers | `/suppliers` | suppliers | `:179` |

### 0.3 Header Right Controls (present on ALL admin pages) — `Header.tsx:271-360`
- **SyncStatusBadge** `:274` → click opens `<SyncQueueManager>` (pending ops, last sync).
- **Force Sync / Clear Cache** (RefreshCw) `:277-301` → clears PWA cache + sessionStorage + reload.
- **Theme Toggle** (Sun/Moon) `:304-315` → `toggleTheme()`.
- **User Block** `:318-339` (name/@username/role + Avatar) → opens mobile drawer on click.
- **Settings gear** `:342-349` → `/settings`.
- **Logout** (LogOut) `:350-357` → confirm + `signOut()`.

### 0.4 Mobile Bottom Nav — `MobileBottomNav.tsx` (`md:hidden`)
Home(`/dashboard`), POS(`/pos`), Stock(`/inventory`), Sales(`/transactions`), Clients(`/customers`), **More** → drawer `:18-64`.

### 0.5 Mobile Drawer Menu — `Header.tsx:364-498`
User card + SyncStatusBadge, 3-col nav grid (same items as desktop), System & Account (Theme / Settings / Logout). Version "POS v12.0" `:492`.

### 0.6 Global Elements (all admin pages)
- `<OfflineBanner/>` (`OfflineBadge.tsx`) — amber banner only when `navigator.onLine===false`, shows pending count `App.tsx:419`.
- `<Toaster>` (sonner toasts) `App.tsx:308`.
- Sync progress overlay when `state.loading` `:391-417`.
- Dynamic PWA manifest/title `:152-212`.

### 0.7 Auth / Login — `src/context/AuthContext.tsx`
- `AuthProvider` `:74-807`; `useAuth()` → `{user, profile, session, loading, signIn, signUp, signOut, updateProfile, updatePassword, refreshProfile, ...}`.
- Session from localStorage (key `sb-zaynah-pos-auth-auth-token` `:122`); offline fast-path restores `pos_offline_profile` `:133-149`.
- 7-day session max, expires only at/after 5 AM `:84-102`.
- `signIn` `:382-598` — email OR username (resolves via `resolve_login_email` RPC). Offline validates `offlineHash` `:488-592`.
- `signUp` `:600-712` — `supabase.auth.signUp` + profile upsert, role hard `'cashier'`.
- `signOut` `:714-747` — clears auth + offline keys.
- Deactivated account (`active===false`) → forced `signOut()` `:256-260`.

#### 0.7.1 LoginPage — `src/components/auth/LoginPage.tsx` (`App.tsx:361`)
Email/Username + Password form `:110-191`. "Forgot password?" → `resetPasswordForEmail` `:49-62`.

#### 0.7.2 ResetPasswordPage — `src/components/auth/ResetPasswordPage.tsx` (`App.tsx:359`)
`updatePassword()` + `signOut()` on cancel `:7-47`. Triggered by Supabase `PASSWORD_RECOVERY` event `AuthContext.tsx:180`.

### 0.8 Global Dialog / Modal System
- **Command dialog** — `src/lib/dialog.tsx`: `dialog.confirm/alert/deleteConfirm/input/loading/close` (event-emitter, singleton guard prevents stacked dialogs).
- **DialogProvider** — `src/components/common/DialogProvider.tsx`: renders modal via portal (z-[9999]), body-scroll lock.
- **Modal primitive** — `src/components/common/Modal.tsx`: props `isOpen,onClose,title,subtitle,maxWidth('sm'|'md'|'lg'|'xl'|'max'|'full'),footer`. Backdrop click does NOT close (only X/Esc).
- **Toast** — `src/lib/sonner.ts` wraps `sonner`.

---

## UI DESIGN SYSTEM & STYLING SPECIFICATION
This section details the complete UI architecture, copyable design tokens, and mandatory visual rules that power the universal POS application interface.

### 1. Core Design Tokens (CSS Variables)
Hardcoded hex colors are completely banned. The application uses a unified, theme-aware CSS variable system (`src/index.css` and `tailwind.config.js`) to handle Light and Dark modes automatically.

| Element | Tailwind Class | CSS Variable | Light Mode | Dark Mode |
|---------|----------------|--------------|------------|-----------|
| **Brand Primary** | `bg-primary`, `text-primary` | `--color-primary` | `#10b981` (Emerald) | `#10b981` |
| **Primary Hover** | `hover:bg-primary-hover` | `--color-primary-hover` | `#059669` | `#059669` |
| **App Background**| `bg-app` | `--color-bg` | `#ffffff` | `#0A0A0A` |
| **Surface (Cards)** | `bg-surface` | `--color-surface` | `#ffffff` | `#171717` |
| **Text Default** | `text-default` | `--color-text` | `#0f172a` | `#ffffff` |
| **Text Muted** | `text-muted` | `--color-text-muted` | `#6b7280` | `#9ca3af` |
| **Borders** | `border-default` | `--color-border` | `#e5e7eb` | `rgba(255,255,255,0.1)`|
| **Danger** | `bg-danger`, `text-danger` | `--color-danger` | `#ef4444` | `#ef4444` |
| **Success** | `bg-success`, `text-success` | `--color-success` | `#10b981` | `#10b981` |
| **Warning** | `bg-warning`, `text-warning` | `--color-warning` | `#f59e0b` | `#f59e0b` |
| **Overlay** | *(Modal Backdrop)* | `--color-overlay` | `rgba(15,23,42,0.5)`| `rgba(0,0,0,0.6)` |

### 2. Typography & Responsive Scaling
- **Font Family:** `'Inter', sans-serif`
- **Responsive Base Sizes:** Desktop/POS terminal uses dense `13px` base to maximize data density. Tablets use `14px`, Mobile uses `13px`.
- **Touch Targets:** Enforces WCAG 2.5.5 constraints. Clickable elements have a minimum `44x44px` hit area (achieved seamlessly via `::after` pseudo-elements so visual layouts remain compact).

### 3. Global CSS Utility Classes
Instead of verbose Tailwind strings, these pre-built abstractions MUST be used:
- **Buttons (`.btn`):** Base class ensuring min-height 44px, `active:scale-95`, and disabled states. Variations: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`. Default size is `.btn-md`.
- **Cards (`.card`):** Standard container (`bg-white dark:bg-surface rounded-2xl`). `.premium-card` adds `rounded-[3rem]` and deeper shadows.
- **Inputs (`.input`, `.select`):** Uniform `w-full px-4 py-3 rounded-xl` inputs handling dark mode focuses and borders seamlessly.
- **Badges:** `.badge-success` (Emerald), `.badge-warning` (Amber), `.badge-danger` (Red), `.badge-info` (Blue), `.badge-purple` (Violet).

### 4. Mandatory Shared Module Rules (🛡️ ANTI-AI BREAKABLE MANDATE)
All interfaces outside of the POS Terminal strictly use `src/shared/ui` modules. **THIS IS A STRICT RULE FOR ANY AI OR DEVELOPER:** You MUST use the exact same shared popups, buttons, icons, media selection, and drag-and-drop components everywhere. NEVER build separate, page-specific versions. If it exists in one place, it must be the SAME everywhere.
- **Button:** `Button` (Props: `variant`, `size`, `icon`, `loading`, `fullWidth`).
- **Icons & Primitives:** Shared icons MUST be used uniformly. No ad-hoc SVG injections for standard actions.
- **Cards & Layouts:** `Card`, `Badge`, `ToggleSwitch`, `SegmentedControl`, `SubTabBar`.
- **Modals & Popups:** `Modal` (Desktop) or `BottomSheet` (Mobile). Hand-rolled `fixed inset-0` overlays are strictly banned.
- **Lists, Data, & Drag-and-Drop:** `Pagination`, `DateRangePicker`, `EmptyState`, `Select` (or `SearchableSelect`), `SharedSearchBar`. Drag-and-drop actions must use the shared library implementations.
- **Loading:** Primary loads use `<SkeletonLoader />` shimmer. Generic spinners are banned.
- **Media Selection:** Image selection exclusively uses the `<MediaLibrary>` component (ensures WebP compression and reusability) EVERYWHERE.
- **Exports:** Table exports must use the `<ExportButton>` component from `src/shared/export`.

### 5. Modal Sizing & Layout Constraints
- Form Modals must use `maxWidth="lg"` or `maxWidth="xl"`. Smaller sizes (`sm`, `md`) are banned for forms to maintain the premium "Expert Density" feel.
- Forms should utilize a 2-column grid (`md:grid-cols-2`) on desktop views.
- **Mobile Modals:** Modals must display in the center of the screen on mobile devices (`items-center justify-center`). Bottom sheets are exclusively for quick action panels (`<BottomSheet>`), not data entry.

---

# Phase 3: Core POS & Transactions

## 1. POS TERMINAL — `/pos` (`POSTerminal.tsx`)

### Header (within POS top strip) — `POSTerminal.tsx:486-576`
- **Sales Tabs** = `SalesTabManager` `:503` (cart multi-tabs, max 3) + Add Tab (+) `:516-525`.
- **Grid Density Controller** `:528` → `GridDensityController` (Auto + 1–8 columns → `state.settings.posGridColumns`).
- **Orders button** (if `estoreEnabled`) `:532-547` → `/online-orders`, badge = pending count.
- **Shortcuts button** (Keyboard) `:548-555` → ShortcutsModal.
- **Sale / Return mode toggle** `:557-574` → `setIsReturnMode` (return = negative-qty cart lines).

### Tabs
- **Sales Tabs (cart multi-tabs)** — `SalesTabManager.tsx`: Tab1/2/3 chips with item-count badge `:155-189`; Close(X) `:177-186`; Add Tab (+) `:191-202`; persists via `salesTabsService`.
- **Category Filter chips** (in ProductGrid) — Featured / All / Bundles & Deals / per-category `ProductGrid.tsx:314-363`.

### Product Catalog — `ProductGrid.tsx:579-585`
#### 2.1 Search & Filter Bar `:263-365`
- Search input `:268-277` (autofocus, live barcode auto-detect `:113-145`, Enter-to-add `:147-174`).
- Clear (X) `:281-288`.
- Camera Scan `:289-295` → **CameraScanner (M)** `:434-461`.
- Drafts `:298-311` → DraftsModal.

#### 2.2 Product Cards `:367-431`
- `ProductCard` click → `onAddToCart` `:486-488`; inline +/− stepper `:521-545`; stock badge `:559-577`.

#### 2.3 Bundles & Deals (`__BUNDLES__`) `:371-372,808-1289`
- `BundleGrid` → `BundleCard`. Click → **DealSizeSelectorModal (M)** (group) `:1272-1287` OR **ComboSelectionModal (M)** (combo) `:1261-1270` OR direct add.
- "Manage Deals" → `/inventory/bundles` `:1157-1198`.

### Cart — `Cart.tsx:589-591` (desktop) / Mobile Drawer `:618-642`
#### 3.1 Cart Header `:256-375`
- Title, Clear Cart (Trash + confirm) `:273-278`, Editing-Sale banner + Cancel `:307-321`.

#### 3.2 Customer Row `:326-499`
- If selected: name/phone + **WhatsApp** `:340-346` + **View Customer** (Eye) `:351-354` → **CustomerDetailModal (M)** + clear `:358-359`.
- Else **Select Customer** `:368-373` → search dropdown `:379-461` (list / NEW toggle `:393-397` / Skip `:449-454` / **Quick Add Customer** inline form `:461-486`).

#### 3.3 Cart Items `:499-704`
- Bundles grouped + standalone. Per-item `CartItemCard`: qty stepper `:1175-1196`, **Discount %** `:1209-1216` → inline panel (%, fixed, apply/clear) `:1247-1281`, **Edit Price** `:1226-1237`, **Remove** `:1238-1240`.

#### 3.4 Summary + Actions `:727-900`
- Subtotal/Tax/discount `:735-755`, active promotions `:756-771`.
- **Bill Discount row** `:772-863` (% / fixed toggle gated by `canGiveDiscount`; **Promo picker (Gift)** `:849-861` → **Promotion Selection Modal (M)** `:904-968`).
- **Grand Total** `:868-874` (red pulse if below cost).
- **Save Draft / Hold** `:879-888` → DraftsModal.
- **Checkout** `:890-896` → CheckoutPage.

#### 3.5 CustomerDetailModal (M) — `CustomerDetailModal.tsx`
Tabs: Details / Sales(n). WhatsApp `:257`; Transaction → **TransactionDetailModal (M)** `:319-420`.

### Popups triggered from POS
- **CheckoutPage (M, full-screen)** `POSTerminal.tsx:644-649` ← handleCheckout `:329-331`.
- **DraftsModal (M)** `:651-655`.
- **ProductOptionsModal (M)** `:658-672` (variant/addon/serial) `:147-156`.
- **ShortcutsModal (M)** `:674-677`.
- **CameraScanner (M)** `ProductGrid.tsx:434-461`.
- **DealSizeSelectorModal (M)** / **ComboSelectionModal (M)** (bundles).
- **CustomerDetailModal (M)** / **TransactionDetailModal (M)**.
- **Promotion Selection Modal (M)** (cart bill-discount).

### Checkout / Settlement — `CheckoutPage.tsx` (PRIMARY)
#### Header Actions `:386-411`
Shortcuts `:388-395`, mobile SAVE `:397-404`, Net Total `:406-409`.

#### Tabs/Selectors (RIGHT column) `:474-643`
- **Sale Type** (Retail / Wholesale / E-Store) `:491-504,908-923` (gated by settings flags).
- **Payment Method** — **Cash / Card / Digital (Bank Transfer) ONLY** `:368-372,512-521`.
- **Received Amount** + Exact `:525-549` + quick chips `:542-549` + Change/Balance `:551-571`.
- **Extra Charges** (delivery) `:575-603` (only estore).
- **Salesman select** `:605-618`.
- **Internal Memo** `:620-642`.

#### LEFT column (Order Items) `:645-924`
Grouped bundles + standalone via `CompactItemRow`; Subtotal/Discount/Tax `:874-891`; Net Payable `:893-906`.

#### Footer `:413-456`
Keyboard hints (1=Cash,2=Card,3=Digital,5=Split,E=Exact,Enter=Pay,Esc=Cancel); Cancel `:439-442`; **Process Payment** `:443-453` → `handlePayment` `:223-360` (creates sale via `salesService.create`; bill-edit atomic path when `editingSaleId` `:271-315`; fulfills store order if `editingStoreOrderId`; clears cart).

#### Post-payment
- **ReceiptPrint (M)** `:374-384` + **KOTPrint** if `enableKotPrinter` `:381`.

### Receipt & KOT (post-payment)
- **ReceiptPrint** — `ReceiptPrint.tsx`: full receipt; auto-print if `settings.receiptPrinter`; action bar WhatsApp/Share PDF/Print/Close `:1855-1917`; supports split-payment display `:849-852`.
- **KOTPrint** — kitchen ticket, print-only.

### DraftsModal (M) — `DraftsModal.tsx`
"Draft Archives" `:36-108`. Lists `state.sales` with `notes includes 'DRAFT_SALE'`. Load `:71` / Delete `:88-93`.

### GridDensityController (H) — `GridDensityController.tsx`
Auto + 1–8 columns `:24-47` → `state.settings.posGridColumns`.

### Bundle/Product Option Modals
- **ProductOptionsModal (M)** `:196-358` — Variation / Variants / Add-ons / Serial IMEI / Add to Cart.
- **ComboSelectionModal (M)** `:152-291` — slot choosers + Extra Toppings + Add to Cart.
- **DealSizeSelectorModal (M)** `:72-118` — size tiers + HOT timer.
- **CameraScanner (M)** — continuous barcode scan.
- **ShortcutsModal (M)** `:35-133` — POS + Checkout shortcut list.
- **CompactItemRow** — pure renderer.

### Data Relations (POS)
Reads: `state.cart`, `state.products`, `state.salesTabs`, `state.selectedCustomer`, `state.settings`, `state.storeOrders`, `state.sales`.
Writes: `salesService.create` → `commit_sale` RPC (atomic sale+stock), `storeOrdersService.update` (status `converted`), `salesTabsService`, `customersService` (stats), `queueOp` (offline fallback).

### Cross-links
- Estore order → "Accept & Load to POS" → `state.editingStoreOrderId` → CheckoutPage fulfils → store order `converted`.
- Draft save → DraftsModal → reload cart.
- Customer select → CustomerDetailModal → customer profile.

---

## 8. TRANSACTIONS — `/transactions` (`TransactionsManager.tsx`)

### Tabs/Filter toggles
All / Retail / Wholesale / E-Store `:462-467`.

### Popups
- **TransactionDetailModal (M)** `TransactionDetailModal.tsx:28` — rendered `:861`:
  - **RefundSaleModal (M)** `:651` (`RefundSaleModal.tsx:17`, SegmentedControl `:92`).
  - **CheckoutModal (M, deprecated)** `:639` (resale/edit — from `pos/CheckoutModal`).

### Data Relations
Reads: `sales`, `payments`. Writes: `salesService` (refund/return via `returnSale`), `stock_history`.

---

## 9. EXPENSES — `/expenses` (`ExpenseManager.tsx`)

### Popups
- **ExpenseModal (M)** `ExpenseModal.tsx:106` — Add/Edit `:496`; "Add Expense" `:248-252`.

### Data Relations
Reads/Writes: `expenses` (cascade delete → related supplier transaction M8).

---


# Phase 4: Inventory & Supply Chain

## 2. INVENTORY — `/inventory/:subTab` (`InventoryManager.tsx`)

### Tabs (T) — `:663-685`
| Tab | Route | Renders | Line |
|---|---|---|---|
| PRODUCTS | `/inventory/products` | product grid + modals | `:689-1073` |
| HISTORY | `/inventory/history` | PurchaseHistory | `:1076-1079` |
| RESTOCK | `/inventory/restock` | PurchaseOrderSystem | `:1074-1075` |
| BUNDLES & DEALS | `/inventory/bundles` | BundleManager | `:1080-1083` |
| GROUPS | `/inventory/groups` | category grouping | `:1084-1173` |
| MEDIA | `/inventory/media` | MediaLibrary | `:1179-1184` |
| STORE SORT | `/inventory/store-sort` | StoreSort (if estoreEnabled) | `:1174-1175` |

### Toolbar (Header) `:719-812`
Add Item `:719`, Import `:725`, Export `:728`, **Reconcile** (F11 stock audit) `:731`, Barcode `:812`, Bulk Edit `:806`, Bulk Delete `:809`.

### 2.1 PRODUCTS tab
#### Popups
- **ProductModal (M)** `ProductModal.tsx:24,476` — Add/Edit; CameraScanner `:1172`; SegmentedControl type (standard/service/serialized) `:491-492`.
- **ProductDetailHub (M)** `ProductDetailHub.tsx:40` — drill-down:
  - Inline Edit Mode (Identity `:880`, Status `:1018`, E-Store `:1119`, Variants & Modifiers `:1165`, Add-ons `:1507`, Toppings).
  - **Stock History** section + filter (All/Stock In/Sales/Returns) `:1781`, paged `:1804-1936`.
  - **Quick Restock (M)** `:1589,1659`.
  - **Stock Adjustment (M)** `:1598`.
  - Embedded **BatchStockInSystem** `:1583`.
  - MediaLibrary `:611/:990`.
- **BarcodeGenerator (M/page)** `BarcodeGenerator.tsx:93` — Layout/Quantities/Content/Dimensions `:656-840`.
- **BulkEditModal (M)** `BulkEditModal.tsx:83` — price/category/supplier/image `:1187`.
- **ReceiptPrint (M)** `:1189` (view sale receipt).
- **CameraScanner (M)** `:105`.

#### Buttons/Actions
Row click → ProductDetailHub; Add Item → ProductModal; Import/Export/Barcode/Bulk Edit/Bulk Delete in toolbar.

### 2.2 HISTORY tab → `PurchaseHistory.tsx`
Purchase records list + stat cards `:319-337`. **Add Stock In** `:452` → **BatchStockInSystem (M)** `:381`. Delete/reverse `:612` → `purchaseRecordsService.delete` (single-reversal F12).

### 2.3 RESTOCK tab → `PurchaseOrderSystem.tsx`
PO creation/commit via shared `commitStockInToInventory` `:133`; CameraScanner `:668`; print CSS `:659`.

### 2.4 BUNDLES & DEALS → `BundleManager.tsx:143`
Toggle Fixed Bundle vs Slot-Based Combo `:542`. Fields: name, deal image (MediaLibrary `:581`), desc, pricing mode, discount, badge `:684`, schedule `:884`, slots `:1070`, extra toppings `:1170`. Per-bundle: edit `:179`, delete `:468`, toggle active `:482`.

### 2.5 GROUPS tab
Category grouping table `:1084-1173` (inline).

### 2.6 MEDIA tab → `MediaLibrary.tsx:231`
Centralized image library (compression, reuse). Used standalone + inside ProductModal/ProductDetailHub/BulkEditModal/BundleManager.

### 2.7 STORE SORT → `StoreSort.tsx:1`
Mode tabs: products_all / products_category / categories / deals `:280-284`; drag-reorder.

### Data Relations (Inventory)
Reads: `products`, `categories`, `product_batches`, `purchase_records`, `bundles`, `product_addons`, `product_toppings`, `stock_history`, `variant_stock_history`, `media`.
Writes: `productsService`, `purchaseRecordsService` (via `commitStockInToInventory`), `bundlesService`, `categoriesService`, `mediaLibrary`, `queueOp`.
Realtime: product changes → POS product grid live update.

---

## 3. SUPPLIERS — `/suppliers` (`SupplierManager.tsx`)

### Tabs
None (single list). 

### Popups
- **SupplierModal (M)** `SupplierModal.tsx:94` — Add/Edit `:370-372`.
- **SupplierLedger (M)** `SupplierLedger.tsx:23` — opened `:179`:
  - **Payment Modal** `:494-571`.
  - **Bill Modal** `:574-638`.

### Data Relations
Reads/Writes: `suppliers`, `supplier_transactions`, `purchase_records`. Cascade: supplier delete → expense cascade (F8/M8).

---


---

# Phase 5: Customers, Marketing & E-Commerce

## 7. CUSTOMERS — `/customers` (`CustomerManager.tsx`)

### Popups
- **CustomerModal (M)** `CustomerModal.tsx:128` — Add/Edit `:541`.
- **CustomerDetailModal (M)** `CustomerDetailModal.tsx:20` — rendered `:548`; tabs Details/Sales; embeds **TransactionDetailModal** `:644`.

### Data Relations
Reads/Writes: `customers`, `sales` (history).

---

## 10. DISCOUNTS — `/discounts` (`DiscountManager.tsx`)

### Popups
- **DiscountModal (M)** `DiscountModal.tsx:285` — Add/Edit `:290`; embeds **MixAndMatchBuilder (M)** `:454` (`MixAndMatchBuilder.tsx:16`).

### Data Relations
Reads/Writes: `discounts` (used by Cart promo picker).

---

## 12. ONLINE ORDERS — `/online-orders` (`OnlineOrdersPage.tsx`)

### Tabs
Active Orders / Past Orders `:256,386-400` + SharedSearchBar.

### Order Status Flow
`pending → accepted → preparing → ready → out_for_delivery → delivered → converted → cancelled` `:216`.

### Popups / Actions
- Select order → **"Accept & Load to POS"** `handleAcceptToPOS` `:329-380` → sets `editingStoreOrderId`, builds cart, `navigate('/pos')`.
- Detail view shows progress `EStoreOrderProgress`; "Converted to Sale (POS)" `:513-517`.
- Pending orders do NOT touch stock (info tooltip `:414-418`).

### Data Relations
Reads/Writes: `store_orders`, `products` (indirect), `sales` (after convert). Realtime: new order → POS sound + UI `CheckoutPage:1197`.

---

## 13. eSTORE FRONT-END (customer-facing) — `/store*` (`EStoreApp.tsx`)

> Separate router tree, mounted at `/store*` (`App.tsx:354-357`). Reads directly from Supabase cloud (no syncEngine).

### 13.1 Router — `EStoreApp.tsx:484-506`
- `/store` → StoreFront
- `/store/checkout` → StoreCheckout
- `/store/track?id=...` → TrackPage → OrderTracker
- Floating WhatsApp FAB if enabled `:508-521`.
- If `!estoreEnabled` → "Store is Closed" `:353-415`.

### 13.2 StoreFront — `StoreFront.tsx`
#### Header `:474-522`
Logo/name; if customer logged in → "My Orders" `:491-497` else "Login" `:499-505`; cart icon → `setIsCartOpen`.

#### Sections
Hero search `:524-539`; Category strip `:541-577`; Deals carousel `:582-810`; All Items grid `:811-856`; Floating cart `:858-876`.

#### Product card
Variants/modifiers → **StoreProductModal (M)**; else direct add.

#### Cart Drawer `:878-1073`
Items + steppers + **Checkout** → `/store/checkout` `:1061-1068`.

#### Modals
- **StoreProductModal (M)** `:1075` — variants + toppings `StoreProductModal.tsx`.
- **StoreDealModal (M)** `:1088` — combo/bundle builder `StoreDealModal.tsx`.
- **Login Modal** (name+phone) `:1100` → `loginOrRegister`.
- **Orders Modal** "My Orders" `:1147` — past orders + "Add to Cart Again" `:287-307` + Logout.

### 13.3 StoreCheckout — `StoreCheckout.tsx` (`/store/checkout`)
- **Fulfillment** Delivery/Self Pickup `:339-388`.
- Form: name*, phone*, address*, geolocation "Detect Location" `:176-211`, notes, payment (COD/custom) `:545-593`.
- **Submit** `handleSubmit` `:220-319`: registers customer; `get_next_invoice_number` RPC `:263`; `place_estore_order` RPC (reserves stock) `:304`; → `/store/track`.

### 13.4 OrderTracker — `OrderTracker.tsx` (`/store/track`)
Fetches `store_orders` by invoice `:24-35`; **Supabase Realtime** subscription `:40-54`; live countdown `:62-91`; auto `delivered` on expiry `:79-81`.

### 13.5 useEstoreAuth — `useEstoreAuth.ts`
Customer state from `localStorage.estore_customer_phone`; `lookupCustomer` `:26`; `loginOrRegister` `:55`; `logout` `:95`.

### eStore → POS Bridge
Customer order → `store_orders` (status pending, stock reserved, NOT deducted). Admin "Accept & Load to POS" → CheckoutPage fulfils → `commit_sale` deducts stock, store order `converted`.

---


---

# Phase 6: Reporting & Configuration

## 11. DASHBOARD — `/dashboard` (`DashboardManager.tsx`)

### Widgets/Cards `:210-306`
Revenue Today, Flow Monitor, Payables, Pending POs, Inventory low-stock. Recent sales feed `:404`.

### Data Relations
Reads: `sales`, `expenses`, `purchase_records`, `products`, `customers` (read-only aggregates).

---


---

## 4. REPORTS — `/reports/:subTab` (`ReportsManager.tsx`)

### Tabs (T) — `:1103-1130`
| Tab | Route | Renders | Line |
|---|---|---|---|
| DASHBOARD | `/reports/sales` | SalesReport | `:1225-1255` |
| INVENTORY | `/reports/inventory` | InventoryReport → InventoryReportManager | `:1311-1322` |
| CUSTOMERS | `/reports/customers` | CustomersReport | `:1259-1268` |
| EXPENSES | `/reports/expenses` | ExpensesReport | `:1280-1292` |
| PAYMENTS | `/reports/financial` | FinancialReport | `:1294-1308` |
| SALESMEN | `/reports/salesmen` | SalesmenReport | `:1270-1278` |
| SUPPLIERS | `/reports/suppliers` | SuppliersReport | `:1323-1330` |

> **No dedicated "Tax" tab** — Tax embedded in SalesReport totals + ReceiptPreview + FinancialReport.

### Filters (Header) `:1139-1222`
Date-range (today/yesterday/last7/thisMonth/lastMonth/all) + contextual (supplier/category/cashier/salesman/payment/store).

### 4.1 SalesReport — `tabs/SalesReport.tsx`
Stat cards (Gross/Net Profit) `:171-188`; Sales Trend `:338`; Sales by Category `:384`; Retail/Wholesale/E-Store cards `:206-257`; Wallet stats `:286-320`; Detailed Sales History `:455-538`. Status label: Completed/Refunded/Partially Refunded `:82-92`; net total `:92`.

### 4.2 InventoryReportManager — `inventory/InventoryReportManager.tsx`
Grand Summary `:650`; sortable product table `:255-264`; Batch Purchase History `:451`. **netItemQty** subtracts `refundedQuantity` (M5).

### 4.3 CustomersReport / ExpensesReport / FinancialReport / SalesmenReport / SuppliersReport
Stat cards, charts, analytics tables per domain.

### Data Relations (Reports)
Reads: `sales` (excludes `pending`/`refunded`/`deleted`/`DRAFT_SALE`), `expenses`, `payments`, `stock_history`, `supplier_transactions`, `customers`, `products`. All from localDb (cached) + background cloud fetch. Cache invalidated on sync/focus `:258-280`.

---

## 5. SETTINGS — `/settings/:subTab` (`Settings.tsx`)

### Tabs (T) — `:578-584`
| Tab | Renders | Line |
|---|---|---|
| General Settings | form sections | `:693-1044` |
| Online Store | E-Store config (if estoreEnabled) | `:1689` |
| Receipt Design | ReceiptPreview | `:1199-1591` |
| Security & Account | PasswordChange | `:1591-1595` |
| Database | DatabaseTools (+ CloudSyncTab if Electron) | `:1191-1197,1597` |

### 5.1 General — `:693-1044`
Sections: Store Identity `:717` (LogoUpload `:722`), Localization & Defaults `:799` (currency `:808`, country `:822`, language `:860`), **Business Logic** `:942` (tax `:909-925`, retail/wholesale/estore modes `:877-879`), Experience `:990`, System Modules `:1044`.

### 5.2 Receipt — `ReceiptPreview.tsx`
Live preview, 11+ templates `:73`; tax line `:204`.

### 5.3 Security → `PasswordChange.tsx:48` (Change Password).

### 5.4 Database → `DatabaseTools.tsx:91`
- **Select Tables** grid `:616-653` (Products, Customers, Sales, Expenses, Discounts, Users, Settings, Categories, Suppliers, Batches, Purchase Records, POs, Supplier Txns, Payments, Stock History, Variant Stock History, Bundles, Toppings, Add-ons, Sales Tabs… `:42-65`).
- **Export** `:658-675`, **Import** `:676-708` (merge by ID/SKU/Barcode/Invoice; F1 name-dedup M14).
- **Barcode Seeding** `:739`, **System Reset** `:766`.
- Embedded **CloudSyncTab** (Electron-only) `:1597`.

### Data Relations
Writes: `app_settings` (singleton `00000000-0000-4000-8000-000000000001`), `users` (password). Instant persist via `handleInstantUpdate`.

---

## 6. USERS — `/users/:subTab` (`UsersPage.tsx`)

### Tabs (T) — `:18-26`
- SYSTEM USERS → `/users/staff` → **UserManager** `:47` → **UserModal (M)** `UserModal.tsx:23`.
- SALESMEN → `/users/salesmen` → **SalesmanManager** `:48` → **SalesmanModal (M)** `SalesmanModal.tsx:123`.

### UserModal (M) — `UserModal.tsx:23`
Role select (cashier/salesman) `:399-401`; permission toggles (price override, discounts, edit/delete sales, stock, PO, purchase history, revenue audit `:411-418`); module-access toggles (inventory/expenses/payments/customers/reports `:456-460`); MediaLibrary `:46/:509`. Create/Update routed via **edge function** `adminUserAction` (H4).

### Data Relations
Reads/Writes: `users`, `salesmen`. Auth user create/delete via edge function `admin-users` (service key never in browser).

---


---

# Phase 7: Page-By-Page Legacy Overviews

## 2. PAGE-BY-PAGE MAP

---

### 2.1 — POS / CHECKOUT (`/pos`)

**Component files:** `src/components/pos/POSTerminal.tsx`, `CheckoutPage.tsx`, `ProductGrid.tsx`, `Cart.tsx`, `CartItemCard.tsx`, `SalesTabManager.tsx`, `ProductOptionsModal.tsx`, `ComboSelectionModal.tsx`, `DealSizeSelectorModal.tsx`, `DraftsModal.tsx`, `ShortcutsModal.tsx`, `CustomerDetailModal.tsx`, `ReceiptPrint.tsx`, `KOTPrint.tsx`, `GridDensityController.tsx`, `CameraScanner.tsx`, `useHardwareScanner.ts`.
**Settlement component used:** `CheckoutPage.tsx` (NOT `CheckoutModal.tsx` — that is mounted only by TransactionsManager, never by the POS terminal).

#### Header (Terminal top bar)
- **Sales Tabs strip** — up to 3 tabs ("Tab 1/2/3" + item-count badge), scroll arrows on hover.
- **Add Tab (+)** — disabled at 3 tabs; dispatch → `salesTabsService.create`.
- **Grid Density controller** — "Auto" + 1–8 column buttons; writes `posGridColumns` to settings.
- **Online Orders bell** — visible only if `estoreEnabled`; navigates `/online-orders`; red badge = count of `pending` store orders.
- **Shortcuts (⌨)** — opens `ShortcutsModal` (static key list).
- **Sale / Return mode label** — shows "SALE" (green) or "RETURN" (red).
- **Return Mode toggle** — when ON, every `addToCart` uses negative quantity (−1); turns terminal into a returns entry flow. Checked out normally (no separate return UI on settlement).

#### Tabs
No page-level tabs (the "tabs" are the Sales Tabs strip in the header). Body = Product Grid (left) + Cart (right; on mobile a centered drawer via "Review Cart" pill).

#### Product Grid
- **Search/scan bar** — placeholder "Search or scan…". Auto-focuses; auto-detects barcode (≥3 chars, 200ms debounce) matches `barcodeValue`/`barcode`/`sku` → auto-adds + clears. Enter does same.
- **Clear (✕)** — clears search.
- **Camera scan** — opens `CameraScanner` (continuous); on scan fills search; if matched → add to cart, else toast error.
- **Drafts button** — opens `DraftsModal` (badge = count of `DRAFT_SALE` sales).
- **Category chips** — Featured, All, Bundles & Deals, then each `product.category`. Click → `setSelectedCategory`. Search bypasses chip.
- **Product cards** — click → `onAddToCart` (qty 1, or weight/qty for weight-based). Hover (＋) quick-add. Stock badge (violet=infinite, red=negative, orange=0, amber=low, emerald=in-stock). If in cart, floating −/qty/+ stepper.
- **Bundles view** — `BundleGrid`/`BundleCard`. Single bundle → `processBundleAdd`; combo → `ComboSelectionModal`; size-group → `DealSizeSelectorModal`. "Manage Deals"/"Create Deal Now" → `/inventory/bundles`.
- **Hardware scanner** — USB/serial via `useHardwareScanner`; exact/normalized match → add + scan sound + toast.
- **Modifier/variant/serial entry** — if product is `variable`, has `variants`, `productAddons`, or `requireSerial`, click opens `ProductOptionsModal` instead of adding directly.

#### Cart panel
- **Title + deal label** ("3 Items · 2 Deals").
- **Clear Cart (🧽)** — `sonner.confirm` → `CLEAR_CART`.
- **Editing Sale banner** — when `editingSaleId` set: amber "Editing Sale" + Cancel (confirm → `CLEAR_CART`).
- **Select Customer** — inline dropdown: search + NEW (+) (switches to Quick-Add form: name*, phone*, email → `customersService.create` → "Save & Link"); list rows clickable; Eye (view profile); "Skip — No Customer". Selected: name + phone/email, WhatsApp (`wa.me`), Eye, ✕ deselect.
- **Cart items** — grouped Bundle/Deal (violet) + Standalone. Per bundle: thumbnail, name (Nx), total, −/qty/+, 🗑 remove. `CartItemCard` row actions: qty stepper; **% discount** (if `profile.canGiveDiscount`) inline panel (%/$ + value); clear item discount; **Edit price** (if `profile.canEditPrice`); **Remove** (🗑). Variant label, modifiers, add-ons, toppings, serial shown.
- **Bill summary** — %/$ toggle (gated) → `billDiscountType`; bill discount input → `billDiscountValue`; 🎁 **Promo picker** (gated) → `Promotion Modal` (active discounts list, click applies). Grand Total (amber; pulses red if below cost). **Save Draft / Hold (🗎)** → `onSaveDraft`. **Checkout (green)** → `onCheckout`.

#### Popups / Modals
| Modal | Trigger | Fields | Submit | Cancel |
|---|---|---|---|---|
| DraftsModal | Drafts btn / F7 | list of DRAFT_SALE sales | click → loadDraft (clears cart, loads items+customer, deletes draft) | Close |
| ProductOptionsModal | tap variant/addon/serial product | variation/variant options/add-on steppers/serial-IMEI | Add to Cart (validates) | Cancel |
| ShortcutsModal | ⌨ btn | static key list | — | Close |
| ComboSelectionModal | tap combo bundle | slot pickers + toppings | Confirm → `processBundleAdd` | Close |
| DealSizeSelectorModal | tap size-group bundle | pick size | onSelect → combo/direct add | Close |
| CustomerDetailModal | Eye on customer | read-only profile | — | Close |
| Promotion Modal | 🎁 promo picker | active discounts | apply → sets bill discount | Close |
| CheckoutPage (settlement) | Checkout / F2 | payment method, amount, sale type, extra charges, salesman, memo | Process Payment | Cancel |
| ReceiptPrint | after payment | receipt preview (A4/80/58mm) | Print / WhatsApp / Share | Close |
| KOTPrint | auto if `enableKotPrinter` | kitchen ticket | auto-print | — |

#### CheckoutPage (Settlement) — Buttons & Actions
- **Right column (Payment):** Net Payable card (mobile). **Sale Type selector** (Retail/Wholesale/E-Store — only enabled channels; default `defaultSaleType`). **Payment Method** — **only 3 buttons: Cash (💵), Card (💳), Digital/Bank (🏦)**. **Received Amount** + **Exact Amount** (fills `finalTotal`). **Quick amounts** (suggested denominations). **Change/Balance Due** (green change / amber due). **Extra Charges** (only if `enableExtraCharges && saleType==='estore'`: Delivery Charges input auto-filled from `estoreDeliveryFee`). **Salesman** `SearchableSelect`. **Internal Memo** textarea.
- **Left column (Order Summary):** bundles + standalone items w/ variant/modifier/serial; per-item discounts; Subtotal, Discount, Tax; Net Payable; Sale Type.
- **Footer:** Shortcuts, **SAVE** (mobile), **Cancel** (→ onClose), **Process Payment** (desktop, disabled unless `canProcessPayment()` & !processing; spinner while processing).
- **`handlePayment`:** invoice via `get_next_invoice_number` RPC (online) or local counter; builds `Sale` (status `'completed'`); edit path creates new sale (deducts stock) → deletes old (restores) with rollback; estore path marks store order `converted` + `fulfilledSaleId`; `refreshAffectedProducts` → `UPDATE_PRODUCT`; `salesService.create` → `ADD_SALE` + `CLEAR_CART` → `setCompletedSale` → `onComplete` → receipt.

#### Data Relations
- **Reads:** products, customers, bundles, discounts, sales tabs, settings, users/salesmen, store orders.
- **Writes on completed sale:** `sales` (+ `stock_history`, `variant_stock_history`, `products.stock`/`variant_data[].stock`, add-on stock, customer stats). Payment embedded in sale (no separate `payments` row at POS checkout).
- **Drafts** (`status:'pending'`, `notes:'DRAFT_SALE…'`): **no stock/customer/revenue effect** (F13).
- **Realtime:** terminal is local-first + queued; `refreshAffectedProducts` updates `state.products` immediately so Inventory/Reports reflect new stock without waiting for sync.
- **Affected pages:** Inventory (stock), Reports (sales/tax/discounts), Customer history, Dashboard (counts), Online Orders (order → converted).

#### ⚠️ Inconsistencies / Dead elements (POS)
1. **No partial/under-payment support** for cash (`paid >= finalTotal` required); card/digital can process with ₹0 received.
2. `CheckoutModal.tsx` is orphaned from the POS path (deprecated per docs).
3. **Return Mode** has no dedicated settlement wording — negative-total sale still says "Process Payment".
4. Camera scan + search auto-add can double-fire for same barcode (mitigated by debounce).
5. Online-orders badge can be stale if realtime lags.
6. Bill discount / promo controls fully gated by `profile.canGiveDiscount` (hidden if flag missing — looks broken but expected).
7. Extra charges only available for estore sale type.

---

### 2.2 — DASHBOARD (`/dashboard`)

**Component:** `src/components/dashboard/DashboardManager.tsx` (408 lines).
**Data:** reads `localDb.sales` directly (today + recent 5) and `state.products/customers/suppliers`. Live on `state.sales` change. **No date-range filter** (only "today" + last 5).

#### Header
- None beyond the global Header. No page-specific buttons.

#### Widgets
**Hero row:**
- **Identity/Greeting card** (indigo) — "System Live" + "POS" badges; **Launch POS** → `/pos`; **Manage Stock** → `/inventory`.
- **Magical Clock** — decorative (`<MagicalClock/>`), no click.

**6 Stat Cards (each clickable → drill-down):**
1. **Revenue Today** → `/reports`. Feeds = today's sales minus refunds. Badge "CASH READY"/"NO CASH".
2. **Flow Monitor** → `/reports`. Feeds = revenue. Shows a **static 3/4-width bar** (not data-driven).
3. **Payables** → `/suppliers`. Feeds = sum suppliers with `balance<0`.
4. **Orders (Pending)** → `/purchase-orders`. Feeds = **`pendingPOsCount` hardcoded `= 0`** — always shows 0.
5. **Inventory (Low Stock)** → `/inventory`. Feeds = products where `trackInventory && stock <= (minStock||5)`. Turns rose + "CRITICAL ALERT" if >0.

**Analytics row:**
- **Business Pulse** (2 cols) — `AreaChart` of `hourlyData` (last ~12h UTC revenue). "Peak Sales" = max hourly. No click/date picker.
- **Live Feed** (1 col) — last 5 sales (`TRX-<id>`, time, total, item count). **Rows are non-clickable.**

#### Data Relations
Reads sales/products/customers/suppliers; navigates into the same `state`-backed modules. No writes.

#### ⚠️ Inconsistencies
- Orders card always 0 (placeholder).
- Flow Monitor bar static.
- No date-range filter.
- Live Feed rows non-clickable.
- Hour bucketing uses `getUTCHours()` while "today" uses timezone-aware day — potential off-by-timezone mismatch.

---

### 2.3 — ONLINE ORDERS (`/online-orders`)

**Component:** `src/components/orders/OnlineOrdersPage.tsx`.
**Access:** only if `state.settings.estoreEnabled` (else redirect `/pos`). Reads `state.storeOrders` (synced, can lag cloud).

#### Header
- **Two tabs:** `Active Orders` (count badge = not delivered/cancelled) and `Past Orders` (delivered/cancelled, capped `.slice(0,50)`).
- **SharedSearchBar** — by invoice #, customerName, customerPhone.
- **"How does stock work?" tooltip** — explains Pending = no stock effect; Accepted = deducted at POS finalize; Cancelled = deleted after 24h.

#### Order List (left)
Each row: #invoice + **NEW** pulsing badge (if not in `seenOrderIds` localStorage); created time; **status badge** (pending/yellow, accepted/blue, preparing/teal, ready/emerald, out_for_delivery/orange, delivered/gray, converted/indigo, cancelled/red); customer name/Guest + total; `OrderTimer` countdown. Row click → select + markSeen + mobile detail.

#### Order Detail (right)
- **Top bar:** back (mobile), #invoice, status badge, total.
- **Actions (only Active tab):** if `converted` → indigo "Converted to Sale (POS)" banner (no actions). Else **"Accept & Load to POS"** (CheckCircle2) and **"Cancel"** (XCircle, danger).
- **OrderProgress** timeline (4 steps): Order Received → Preparing → On The Road → Delivered.
- **Contact Info**, **Delivery Address** (Google Maps link if coords), **Customer Note** (yellow), **Order Items** (deals + standalone, w/ variant/modifier/addon/toppings/serial), **Payment Summary** (subtotal, delivery, discount, tax, total).

#### Status Flow
`STATUS_FLOW = ['pending','accepted','preparing','ready','out_for_delivery','delivered','converted','cancelled']`.
| Status | How reached | Write |
|---|---|---|
| pending | customer checkout (RPC) | store_orders insert |
| accepted | **NO UI button** | — |
| preparing | "Accept & Load to POS" → `updateStatus(order,'preparing')` | `storeOrdersService.update` + queueOp |
| ready / out_for_delivery / delivered | **NOT settable here** | — |
| converted | POS finalize writes `fulfilledSaleId` | store_orders update |
| cancelled | **Cancel** button → `updateStatus(order,'cancelled')` | store_orders update (soft; no delete) |

- `getNextStatus()` exists but **unused** — no step-wise advancement.
- **"Accept & Load to POS"** side-effects: `SET_EDITING_STORE_ORDER_ID`, injects "Delivery Fee" line if `deliveryFee>0`, `SET_CART`/`SET_NOTES`/`UPDATE_SALES_TAB`, navigate `/pos`.
- **Timer** (`estoreOrderTimerEnabled`): UI warning only, no auto status change.

#### Data Relations
Reads `store_orders`. Writes status to `store_orders` (synced). No refund/return/print/assign here.

#### ⚠️ Inconsistencies
1. `accepted` status unreachable (Accept jumps pending→preparing).
2. No step-wise status control (ready/out_for_delivery/delivered only via POS conversion).
3. No refund/return/print/assign.
4. Cancel is soft (relies on 24h prune).
5. Reads from synced local `state.storeOrders` (can lag cloud).
6. Past Orders capped at 50.

---

### 2.4 — TRANSACTIONS / SALES (`/transactions`)

**Components:** `TransactionsManager.tsx`, `TransactionDetailModal.tsx`, `RefundSaleModal.tsx`.
**Access:** all authed (`isAdmin = true` hardcoded → edit/delete/refund always enabled).

#### Header
- **Back** → `/pos`.
- **Export** (`ExportButton`) — exports currently filtered rows (columns incl. costOfGoods + grossProfit for admin).
- **No manual Refresh** (auto via `'pendingops-changed'` window event → `loadMoreSales`).

#### Stat Cards
- Total Revenue = Σ(total − refundedAmount).
- Retail/Wholesale/Estore Sales (conditional on enabled channels).
- Items Sold.
- **Wallet Breakdown** — Cash/Card/Bank (F16-compliant subtraction).

#### Filters
- `SharedSearchBar` (receipt/invoice/customer/cashier).
- `SearchableSelect` Sale Type (All/Retail/Wholesale/Estore).
- `SearchableSelect` Payment (All/Cash/Card/Digital/Split).
- `SearchableSelect` Cashier.
- `SearchableSelect` Salesman.
- `DateRangePicker` presets (Today/Yesterday/Last7/ThisMonth/PrevMonth/Custom/All).
- Non-default filters → cloud `salesService.searchSales` (500ms debounce); else local filter.
- **NO status/returns tab** (no All/Sales/Returns/Refunds filter — refunds show inline via Badge only).

#### Sale List
- Desktop table: Receipt (#invoice or DC pill), Date+time, Customer (+ cashier + salesman), Total (strikethrough −refunded if refunded), Status Badge, Actions.
- Row actions: Eye → detail; Printer → quick print `ReceiptPrint`; Edit (confirm → load to POS via `SET_EDITING_SALE_ID`); Delete (confirm → `salesService.delete`).
- Mobile: cards; tap → detail (no inline edit/delete).
- Pagination (15/page). Drafts/`pending`/invalid excluded.

#### Sale Detail (`TransactionDetailModal`)
- Source Badge (RETAIL/WHOLESALE/ONLINE STORE); refunded/partially_refunded banners.
- Info grid: Receipt, Date, Customer, Cashier, Salesman, DC Number, "View Delivery Location" (Maps if coords).
- Items table (Bundle/Deal + standalone) — each row clickable → `/inventory/products` with `fromSale`; shows variant/modifier/addon/topping/serial/`refundedQuantity`.
- Memo, Split Payment Breakdown, Subtotal, Discount, Tax, Delivery Charges, Refunded Amount, Net Total.
- Footer: Prev/Next, Print, WhatsApp (`wa.me`), **Refund**, **Edit**, **Delete**.

#### Refund / Return (`RefundSaleModal`)
- `SegmentedControl`: Full / Partial.
- Partial: per-item qty steppers (max = qty − refundedQuantity); computes `refundAmount`.
- **No refund-method or reason field captured.**
- Submit → `salesService.returnSale(id, request, cashier)`:
  - **F12 single-reversal** (inside service, `activeReturns` mutex, no-op if already refunded): writes `stock_history`/`variant_stock_history` (`type:'return'`) + add-on stock, atomically via `refundSaleAtomic` RPC.
  - Updates sale `status` (`refunded`/`partially_refunded`) + `refundedAmount`.
  - **F16:** writes `payments` row `direction:'out'`, `method` = sale method (or cash if split).
  - Customer `totalPurchases -= totalRefundAmount`.

#### Delete flow (`salesService.delete`)
- Reverses stock (`type:'return'`) for `qty − refundedQuantity`; hard-deletes sale + queues delete; reverses customer `totalPurchases`. Drafts never reverse (F13).

#### ⚠️ Dead / Inconsistent code
1. `handleDeleteSale` (TransactionsManager) **defined but never called** — list delete inlines its own `salesService.delete`. Two parallel delete paths.
2. `TransactionDetailModal` inline `<CheckoutModal>` (`showCheckout` never true) = **dead code**.
3. No status/returns filter tab.
4. No refund reason/method capture.
5. Mobile rows lack inline edit/delete.

---

### 2.5 — EXPENSES (`/expenses`)

**Components:** `ExpenseManager.tsx`, `ExpenseModal.tsx`.
**Tables:** `expenses`, read-only `state.users` (Added By filter). **No supplier link** (despite `Supplies` category existing). Categories come from hard-coded `EXPENSE_CATEGORIES` constant (NOT the `categories` DB table).

#### Header
- **Add Expense** → `ExpenseModal` (create).
- No export/refresh/filter-toggle in header (filters in toolbar).

#### Filters
- `SharedSearchBar` (description); `SearchableSelect` Category (EXPENSE_CATEGORIES); Method (cash/card/digital); User (union users + expense.addedBy); `DateRangePicker`. All local.

#### Stat Cards
- Filtered Total (sum amount); This Month; Top Category.

#### Expense List
- Desktop table: Date&Time, Description (+notes + "By {addedBy}"), Category Badge, Method Badge, Amount (−currency), Actions (Edit/Delete on hover).
- Mobile cards → tap opens edit modal. Pagination (25).

#### Add/Edit Expense Modal (`ExpenseModal`, maxWidth="lg")
Fields: **Description***, **Amount*** (regex `^\d*\.?\d*$`, no positivity check → negatives possible), **Expense Date***, **Category*** (Select from constant), **Payment Method*** (cash/card/digital), **Channel** (General/Retail/Wholesale/Estore toggle, if enabled), **Administrative Notes**, **Manual Override** toggle (`isManualOverride` stored but `overrideBy` never set).
- Submit → `expensesService.create/update` → Dexie + `queueOp` + dispatch. `addedBy` injected from current user. `isAdmin` guard is dead (always true).

#### Delete
- `sonner.deleteConfirm` → `expensesService.delete` + dispatch DELETE_EXPENSE.

#### ⚠️ Inconsistencies
1. `isAdmin` guards dead.
2. `isManualOverride` stored but `overrideBy` never set.
3. **No category CRUD** (fixed constant only).
4. **No supplier linkage** (Supplies expense does not create supplier transaction or affect balance).
5. Amount allows non-positive input.

---

### 2.6 — INVENTORY (`/inventory/:subTab`)

**Component:** `InventoryManager.tsx` (1207 lines) + sub-components.
**Access:** all authed (`isAdmin=true` hardcoded). `purchases` gated by `canViewRecords`; `restock` by `enablePurchaseOrders !== false`; `store-sort` by `estoreEnabled`.

#### Actual sub-tabs (7 — enumerated from `InventoryManager`)
| Internal | Route | UI Label | Component | Gated |
|---|---|---|---|---|
| inventory | products | PRODUCTS | inline | always |
| purchases | history | HISTORY | PurchaseHistory | canViewRecords |
| purchase_orders | restock | RESTOCK | PurchaseOrderSystem | enablePurchaseOrders!==false |
| bundles | bundles | BUNDLES & DEALS | BundleManager | always |
| groups | groups | GROUPS | inline categories view | always |
| media | media | MEDIA | MediaLibrary (standalone) | always |
| store_sort | store-sort | STORE SORT | StoreSort | estoreEnabled |

**No separate low-stock or stock-history sub-tab.** Low-stock = stat on PRODUCTS; stock history = per-product in `ProductDetailHub`; incoming ledger = HISTORY.

#### PRODUCTS sub-tab
- **Stat cards:** Active Items, Low Stock, Stock Value, Out of Stock.
- **Toolbar:** Add Item → `ProductModal`; Import (JSON) → bulk `productsService.create` (F1 dup-name guard); Export (selected → JSON); **Reconcile** → `reconcileAllStock()` (F11 audit tool); `SharedSearchBar` (name/barcode/SKU + hardware scanner); Category/Type (Standard/Service/IMEI-Serialized)/E-Store-Only/Sort filters; **Bulk actions** (BULK EDIT → `BulkEditModal`; DELETE → chunked `bulkDelete`; PRINT BARCODES → `BarcodeGenerator`).
- **Row actions:** click → `ProductDetailHub`; Enable/Disable; Featured star; Delete (confirm).
- Columns: checkbox, Item (image/name/star/category·supplier/badges), SKU, Barcode (`BarcodePreview`), Pricing, Stock Status (∞ if untracked/≥990000 else colored vs `minStock||5`), Actions.

#### HISTORY sub-tab (`PurchaseHistory.tsx`)
- Incoming stock ledger. Filters: search, Supplier, Category, User, `DateRangePicker`, **+ New Record** (entry view).
- Entry view (Add Purchase Record): product autocomplete, qty, cost, retail, supplier, date, notes → `purchaseRecordsService.create` (updates stock + `stock_history` + `purchase_records`, F22).
- Row delete → `purchaseRecordsService.delete` (single-reversal: `adjustment_out` history, F12).
- Embedded `BatchStockInSystem`: multi-product batch stock-in → `commitStockInToInventory` + zeroing adjustment.

#### RESTOCK sub-tab (`PurchaseOrderSystem.tsx`)
- **Auto (Reorder)** mode: deficiency list (stock ≤ minStock or < targetStock); editable qty/cost/retail; **COMMIT & ADD TO STOCK** → `commitStockInToInventory` (F22) + optional supplier bill.
- **Manual (Custom)** mode: search/add products; batch supplier/category; same commit.
- Export + print (CSS PO sheet).
- ⚠️ **Auto-mode trash button calls `handleRemoveFromPO` which is NEVER defined** → runtime ReferenceError. Manual-mode trash (`removeFromManualList`) works.

#### BUNDLES & DEALS (`BundleManager.tsx`, 1697 lines)
- Two types: `isCombo=false` = Bundle (fixed items + discount); `isCombo=true` = Combo (slots w/ options).
- List cards (expand, Edit/Delete/Enable-Disable, category filter).
- Create/Edit fields: name (≥3), description, image (MediaLibrary), discountType (percentage/fixed), discountValue, overridePrice, hideItemPrices, badge, scheduleType (always/scheduled) + start/end date + repeatDays + start/end time, extraToppings. Bundle: items[]; Combo: slots[] w/ options. Validation via sonner.
- Delete (confirm) → `bundlesService.delete`. Enable/Disable toggle.
- Applied at POS via `Cart.tsx` (bundle pricing, serial guard).

#### GROUPS sub-tab (inline)
- Table of distinct `product.category` strings: Items count, Total Stock, In-Stock Value, **View All** → `/inventory/products`. **No create/edit/delete UI.**
- ⚠️ Categories not managed entities; `ProductModal.handleAddCategory` only sets form value (does NOT call `categoriesService.create`); `state.categories` table largely unused by product form.

#### MEDIA sub-tab
- `MediaLibrary` standalone (compress to WebP ≤50KB via `compressImage`). Single image source for products/deals (rule 14).

#### STORE SORT sub-tab (`StoreSort.tsx`)
- Drag/drop reorder of `estoreSortOrder` (products) + `estoreCategorySortOrder` + bundle sort. Per-product `showInEstore` toggle (`productsService.update`). Gated `estoreEnabled`.

#### Add/Edit Product Modal (`ProductModal.tsx`) — ALL fields
- **Identity:** productType (Simple|Variable), name*, category* (Select + quick-add), supplier (Select + quick-add → auto-creates `suppliers` row), sku (auto), barcode (gen/scan/preview).
- **E-Store:** showInEstore, isFeatured.
- **Financials/Inventory:** price*, cost* (≥0), trackInventory (forced true for variable), stock (initial), minStock, targetStock.
- **Visual:** image (MediaLibrary, ≤50KB WebP).
- **POS Enhancements:** isService (disables stock), requireSerial (IMEI/SN at POS).
- **Variants builder** (variable only): variant names + option tags → `variantData[]` → child `Product` rows (`productType:'variation'`, `parentId`).
- **Modifiers/Add-ons:** modifiers[], productAddons[].
- Submit: RBAC guard (cashier blocked), validation, dup-SKU/barcode handling, `stock_history` 'initial'/'adjustment', `productsService.create/update` + dispatch.

#### Stock-In / Restock flow (unified, F22)
Single source: `commitStockInToInventory` (`src/lib/stockInCommit.ts`), used by Restock bulk-admit + `ProductDetailHub` Quick Restock. Per item: `purchaseRecordsService.create` (updates `products.stock` + writes `stock_history` `stock_in`/`adjustment_out`, variant movement if `variantId` F22) + dispatch ADD/UPDATE. If `recordAsSupplierBill && supplier matched` → `suppliersService.recordBill`.

#### Stock History (per-product) — `ProductDetailHub.tsx`
- Movement table (Date/Time, Entity, User, signed Qty Change) from `stock_history` + `variant_stock_history`.
- Modals: **Quick Restock** (supplier, qty, cost, "Record as Supplier Bill" → `commitStockInToInventory`); **Stock Adjustment** (signed qty, reason → `productsService.update` + manual `stock_history` 'Adjustment' + `purchaseRecordsService.create`, F12).

#### Barcode management
- `ProductModal`: `generateBarcode()` (random), `generateSku()`, CameraScanner, live `BarcodePreview`.
- Bulk: select → PRINT BARCODES → `BarcodeGenerator` (label format, quantities, print).
- F1 dup guard (rejects duplicate name + duplicate barcode).

#### Data Relations
- Stock-in → `products.stock`/`variant_data[].stock` + `stock_history`/`variant_stock_history` + `purchase_records`.
- Stock-in → Supplier ledger (supplier-name match → `recordBill`, raises payable).
- Product ↔ Supplier (string/`supplierId`; new supplier auto-creates row; delete guarded by product linkage).
- Bundle ↔ Products (applied at POS).

#### ⚠️ Inconsistencies / Dead
1. **`handleRemoveFromPO` undefined** (Restock auto-mode trash → ReferenceError).
2. **`purchase_orders`/`purchaseOrderItems` tables + `purchaseOrdersService` orphaned** — no PO CRUD/GRN in UI (see §2.9).
3. `product_batches` table **deprecated** — stock-in never writes batch rows; `batches[]` on Product vestigial.
4. Categories not persisted as entities.
5. Role gating disabled (`isAdmin=true`).
6. Supplier modal omits `businessType`/`paymentTerms`/`rating`.

---

### 2.7 — SUPPLIERS (`/suppliers`)

**Components:** `SupplierManager.tsx`, `SupplierModal.tsx`, `SupplierLedger.tsx`.
**Tables:** suppliers, supplierTransactions, expenses (supplier payouts create expense rows), purchase_records, products.

#### Supplier list
- Stat cards: Active Partners (count), Total Payables (`getBalance` summed).
- Toolbar: Add Supplier → `SupplierModal`; `SharedSearchBar`; `DateRangePicker`.
- Grid cards: name, businessType badge, phone, email, address, **View Ledger** → `SupplierLedger`.
- Row actions: Edit → `SupplierModal`; Delete (blocked if products linked; else confirm → `suppliersService.delete` cascades its `supplierTransactions`).

#### Add/Edit Supplier Modal (`SupplierModal`)
Fields: Legal Entity*, Lead Contact, Business Mobile*, Operational Email, Tax Identity/NTN, Distribution Hub Address, Initial Debt Balance (create only → opening-balance `recordBill`). `businessType`/`paymentTerms`/`rating` exist on type but NOT in modal.

#### Supplier Ledger (`SupplierLedger`)
- Header: name, phone, paymentTerms, Outstanding Balance, stats (Total Billed/Paid/Remaining).
- Manual ledger table (Bills & Payments): Date, Type badge (AUTO-PURCHASE/PAID/OPENING/MANUAL BILL), Description, Paid (Dr), Bill (Cr), Actions (delete).
- **Record Bill** (`recordBill`): amount, note, Manual Override → raises balance.
- **Record Payment** (`submitPayment`): amount, method (cash/card/digital), note, Manual Override → creates an **`expenses` row** (`category:'Supplies'`) + `recordPayment` (lowers balance).
- **Delete transaction:** cascades to delete linked `expenses` row (F16).

#### Data Relations
Stock-in with matching supplier name → auto_purchase `supplierTransactions` bill. Payment → expense + recordPayment. Cross-links Inventory + Expenses + Reports (Suppliers report).

---

### 2.8 — PURCHASE ORDERS (`/purchase-orders`)

**Route:** `/purchase-orders` → `PurchaseOrderSystem` (same component as Inventory RESTOCK sub-tab).
**Reality:** This is a **Reorder/Restock Generator**, NOT a PO document system. `purchase_orders`/`purchaseOrderItems` Dexie tables + `purchaseOrdersService` (create/getById only, no update/receive/delete) are **never called by any UI** → orphaned schema.

#### What exists
- Auto mode: deficiency-based reorder (supplier + category filters) → editable qty/cost/retail → **COMMIT & ADD TO STOCK** → `commitStockInToInventory` (writes `purchase_records` + `stock_history` + `products.stock`, optional supplier bill). **No PO record saved.**
- Manual mode: search/add products → same commit.
- Print/Export: browser `@media print` PO sheet + `ExportButton`.
- No draft/sent/received statuses, no GRN, no `purchase_orders` row creation.

#### ⚠️ Flagged discrepancy
| Assumed | Actual |
|---|---|
| PO status flow draft→sent→received/GRN | Absent. "Receive" = immediate `commitStockInToInventory`. |
| Create PO → `purchase_orders` row | Never written (`purchaseOrdersService.create` unused). |
| PO receipt updates stock + supplier ledger | Stock via commit (same as any restock); supplier ledger only on name match. |
| PO list/detail/edit/delete/print | Only printable generated sheet; no PO object persistence. |

---

### 2.9 — CUSTOMERS (`/customers`)

**Components:** `CustomerManager.tsx`, `CustomerModal.tsx`, `CustomerDetailModal.tsx`.
**Tables:** customers, sales (items nested in `sale.items[]`), payments.

#### Header / Toolbar
- **Add Customer** → `CustomerModal` (create).
- `SharedSearchBar` (name/email/phone).
- `SearchableSelect` Date range (All/Today/Yesterday/Last7/ThisMonth/PrevMonth/Custom). Client-side filter on `lastPurchase` or linked sale.
- Stat cards: Total Customers, Total Sales, Average Sale, Active (30d).

#### Customer List
- Desktop table: Info (avatar+name+ID), Contact, Total Purchases, Last Purchase (NEVER if none), Actions (View/WhatsApp/Edit/Delete). Mobile cards. Pagination (25).

#### Add/Edit Customer Modal (`CustomerModal`, maxWidth="lg")
Fields: Client Name* + Mobile* (required), E-Mail, Pricing Tier (retail/wholesale Select), Physical Address, Notes. **`preferredCategories` exists in formData state but is NOT rendered and is dropped on submit.**
- **No loyalty/points field** (data model lacks it; only `priceTier`). **No credit-balance input** (RESOLVED — credit sale system removed).
- Submit → `ADD_CUSTOMER`/`UPDATE_CUSTOMER` (context dispatch → localDb + queue).

#### Customer Detail (`CustomerDetailModal`, maxWidth="lg")
Tabs: **Details**, **Sales (count)**.
- (RESOLVED — credit sale system removed; no Outstanding Credit banner / "Wasool Karo" / Collect Payment.)
- Details: Total Spent, Total Orders, Avg Sale, contact.
- Sales: Paid Transactions (each → `TransactionDetailModal`).
- Payments: history (cash/card/digital/bank_transfer/cheque).

#### Delete
- confirm → `customersService.delete` + `DELETE_CUSTOMER`. **No cascade** — linked sales remain (RESOLVED — credit ledger no longer exists).

#### ⚠️ Inconsistencies
1. No loyalty/points field (RESOLVED — credit-balance input no longer applicable, credit sale system removed).
2. `preferredCategories` in state but not rendered/dropped on submit.
3. Delete has no cascade (linked sales remain) (RESOLVED — credit ledger removed, so nothing to clear).

---

### 2.10 — REPORTS (`/reports/:subTab`)

**Components:** `ReportsManager.tsx` + `src/components/reports/tabs/*` (SalesReport, InventoryReport, CustomersReport, ExpensesReport, FinancialReport, SalesmenReport, SuppliersReport).
**Access:** all authed (chips hidden unless `hasFullAccess`, which is effectively always true).

#### Actual sub-tabs (7 — `validReportTypes`)
| Key | Label | Component |
|---|---|---|
| sales | DASHBOARD | SalesReport |
| inventory | INVENTORY | InventoryReport |
| customers | CUSTOMERS | CustomersReport |
| expenses | EXPENSES | ExpensesReport |
| financial | PAYMENTS | FinancialReport |
| salesmen | SALESMEN | SalesmenReport |
| suppliers | SUPPLIERS | SuppliersReport |

**NOT PRESENT:** Restock history report (it's Inventory `PurchaseHistory`), Tax report (folded into Sales/Financial), standalone Profit report (folded into Sales/Financial). **Closing/shift tab explicitly filtered out** (shift system removed).

#### Common pipeline (all tabs)
- Date range presets (Today/Yesterday/Last7/ThisMonth/LastMonth/All/Custom) → timezone-aware window.
- **F6:** queries Supabase directly via `fetchAllPages` (`getReportSales`/`getReportRefunds`/`getReportExpenses`); excludes `refunded`/`deleted`/`pending` (F13) + DRAFT_SALE notes; **no `.limit()`/`.slice()`** (F14). Falls back to localDb on error.
- **F15:** `reportSales` + `reportRefunds` merged by id (sales copy wins) — prevents double subtraction of `partially_refunded`.
- Memory cache (10s) invalidated on `pendingops-changed`/focus/visibility/`state` changes.
- Payments from `localDb.payments` (non-credit), refund payouts (`direction:'out'`) excluded (F16).
- Shared toolbar filters (hidden on customers tab): Supplier, Category, Cashier, Salesman, Payment, Store.
- **Export:** shared `ExportButton` (CSV/print). No separate PDF path.

#### Sub-tab details
- **sales (DASHBOARD):** 7 summary cards (Revenue, Transactions, Avg, COGS, Gross Profit, Expenses, Net Profit) + Sale Mode KPIs + Expected Wallet Balances + charts (Sales Trend line, Revenue By Item Type pie, Sales by Category pie, Top Variants, Sale Type pie) + Detailed Sales History table (ExportButton) + Top Selling Products.
- **inventory (INVENTORY):** per-product stock/minStock/status/value/potentialRevenue/soldQty/revenue/turnover/profitMargin; sort by status then revenue; internal ExportButton + pagination.
- **customers (CUSTOMERS):** 4 stat cards; Top Customer Spending line (top 10); Customer Analytics table (ExportButton). **Table capped at `slice(0,20)` while export covers all** (mismatch).
- **expenses (EXPENSES):** wallet breakdown cards; Expense Trend line; Expenses by Category pie; All Expenses ledger + ExportButton.
- **financial (PAYMENTS):** 4 profit cards; Wallet-wise Summary (cash/card/digital: Sales/Refunds/Expenses/Net) + Grand Total Net banner; ExportButton. No charts.
- **salesmen (SALESMEN):** 4 stat cards; Top Salesmen Revenue line; Salesman Analytics table + ExportButton.
- **suppliers (SUPPLIERS):** does NOT use central pipeline; loads own via `getBalance`+`getLedger`. 4 stat cards; Search + sortable cols + ExportButton + redundant manual Blob `handleExportCSV`.

#### Data Relations
Reads sales/expenses/payments/products/customers/salesmen/suppliers. No writes (read-only reports).

---

### 2.11 — DISCOUNTS (`/discounts`)

**Components:** `DiscountManager.tsx`, `DiscountModal.tsx`, `MixAndMatchBuilder.tsx`.
**Table:** discounts.

#### List (`DiscountManager`)
- **Add Discount** → `DiscountModal`.
- Stat cards: Total, Active, Percentage, Free Gift.
- `SharedSearchBar` (name/description).
- Table: Discount, Type badge, Value, Conditions (count), Valid Period, Status (clickable → toggles active/inactive), Actions (Edit, Delete). Pagination (20).

#### Create/Edit Modal (`DiscountModal`, maxWidth="lg")
Fields: Name*, Type (percentage/fixed/bogo/free_gift/mix_and_match), Value* (hidden for free_gift/mix_and_match), Min Basket (`minAmount`), Max Ceiling (`maxDiscount`), Valid From/To, Weekly Cyclic Schedule (Sun–Sat `validDays`), **conditions** (rows: type min_amount/specific_products/payment_method/customer_tier/card_type/bank_name + value; specific_products uses `SharedProductList`), Status Active toggle, Auto Apply toggle (`isAutoApply`). Title uses i18n "privilege" keys (inconsistency).
- Submit → `discountsService.create`/`update` + dispatch.

#### How discounts apply at POS
- POS `Cart.tsx` **Promo picker** lists `state.discounts.filter(active)`; tap sets `billDiscountValue`/`billDiscountType`. **No promo-code input** (manual tap only).
- **No auto-apply:** `isAutoApply` stored but never read.
- **Conditions NOT enforced:** promo picker applies raw value to whole bill; `isDiscountApplicable()` helper (validates active/date/validDays/conditions) is **defined but never called** (dead code).

#### ⚠️ CRITICAL BUG
- `discountsService` (`services.ts:2903`) **only defines `getAll`, `create`, `fetchRemote` — NO `update` and NO `delete`.** Therefore `DiscountManager.handleDeleteDiscount`, `toggleDiscountStatus`, and `DiscountModal` edit all throw `TypeError`, caught by try/catch → error toast, and **local dispatch never runs**.
- **Net effect:** Discounts can be CREATED but never EDITED, DELETED, or STATUS-TOGGLED through the UI. Confirmed broken.

#### Other inconsistencies
- `isDiscountApplicable()` + `isAutoApply` dead → conditions (min amount, products, payment, tier, card/bank, valid days, date window) never enforced.
- No promo-code / auto-apply at POS (cosmetic "Auto Apply" toggle).

---

### 2.12 — SETTINGS (`/settings/:subTab`)

**Component:** `Settings.tsx` (2273 lines) + `DatabaseTools.tsx`, `PasswordChange.tsx`.
**Singleton:** `app_settings` id `00000000-0000-4000-8000-000000000001`. Instant fields → `handleInstantUpdate`; buffered text → committed on Save (StickyFormFooter "Update System" / "Discard").

#### Actual sub-tabs (5)
| Tab | Label | Visible when |
|---|---|---|
| general | General Settings | always |
| estore | Online Store | `estoreEnabled` |
| receipt | Receipt Design | always |
| security | Security & Account | always |
| database | Database | always |

**No dedicated backup/restore tab, no barcode-format tab, no users tab** (backup lives in Database; barcode format only in `BarcodeGenerator`).

#### general (`/settings/general`)
- **Store Identity:** LogoUpload (MediaLibrary → `storeLogo`), storeName, storePhone, storeEmail, storeWebsite, storeAddress (buffered).
- **Localization & Defaults:** currency, country, language (en/ur/ar), defaultSaleType, receiptPaperSize, taxRate, taxId (instant/buffered mix).
- **Business Logic:** invoicePrefix + invoiceCounter + **"Repair"** button (`handleRepairCounter` queries max invoice from `sales`, online only).
- **Experience:** theme (light/dark/auto), interfaceMode (touch/traditional).
- **System Modules** (instant toggles): retailEnabled (guard forces ≥1 sale type on), wholesaleEnabled, estoreEnabled (master kill-switch for `/store` + `/online-orders` + Header Orders + Settings estore tab + Inventory store-sort), touchKeyboardEnabled, soundEnabled, enableExtraCharges.
- ⚠️ Guard silently re-enables retail if you disable last sale type.

#### estore (`/settings/estore`) — if enabled
- "Visit Store" → opens `/store`.
- Fulfillment: Shop Hours, Home Delivery toggle + times, Customer Pickup toggle + times.
- Shop Location & Delivery: storeLatitude/Longitude, estoreDeliveryRadius, "Use Current Location" (geolocation).
- Advanced Theme: 10 presets + 5 color pickers (estoreThemeColor etc.).
- Live Order Timer: estoreOrderTimerEnabled + minutes.
- estoreCodEnabled; estoreCustomPaymentEnabled + name/detail/note.
- estoreDeliveryFee, estoreMinOrder.
- WhatsApp Support: estoreWhatsappEnabled + number.

#### receipt (`/settings/receipt`)
- Col1: Paper Size, Visual Template (15 options), Font Weight slider, Zoom Scale slider, Auto Print (`receiptPrinter`), Enable KOT (`enableKotPrinter`), Auto-Save Receipt PNG, receiptHeader/Footer.
- Col2: Hardware Calibration sliders (padding/offset) + Reset; Print Visibility 15 checkboxes.
- Col3: Live `<ReceiptPreview>` + **"Test Print"** (mock sale, no DB write).

#### security (`/settings/security`)
- Renders `<PasswordChange />` — change own password only. No user/role management.

#### database (`/settings/database`)
- Renders `<DatabaseTools />`:
  - **Select Tables** grid (24 stores). Select All/Deselect All.
  - **Export** → JSON `pos_backup_<date>_<ts>.json` (version "2.0").
  - **Import** → JSON merge (skip dups by ID/SKU/Barcode/Invoice/Name/Phone/Email/PO#), queue sync ops, refresh from IndexedDB, summary.
  - **Barcode Seeding** → `seedMissingBarcodes()`.
  - **System Reset** (danger) → `purgeLocalData()` (wipe local + fresh sync).
  - **Electron-only** "Database Adapter" section (Supabase URL/Anon/Service + "Apply & Restart") — invisible in web build.
- ⚠️ **No Reconcile button here** (reconcile is only in InventoryManager, F11).
- ⚠️ `barcodeBarWidth` + all `barcode*` settings in `formData`/`mapSettings` have **no UI control in Settings** (only used by `BarcodeGenerator`).

#### ⚠️ Dead code
- `BackupTab.tsx` — defined but never imported/rendered (backup is in DatabaseTools).
- `CloudSyncTab.tsx` — imported in Settings.tsx but never rendered (dead import).

---

### 2.13 — USERS (`/users`) — BLOCKED / INACCESSIBLE

**Confirmed block:** `App.tsx:99` `if (viewId === 'users') return false;` → `<Navigate to="/pos" replace />`. **Every `/users*` URL (incl. `/users/staff` auto-redirect) is intercepted → `/pos`.** Page 100% unreachable from UI.

**What `UsersPage.tsx` would contain** (if it could render):
- Sub-tabs: SYSTEM USERS (`/users/staff` → `UserManager`) and SALESMEN (`/users/salesmen` → `SalesmanManager`).
- `UserManager`: staff list, Add/Edit (`UserModal`), Delete (guards self-delete), toggle per-user permission booleans (not role picker).
- `SalesmanManager` + `SalesmanModal`: separate salesman records.
- Auth/user records still sync; only the route is blocked. Password reset lives in Settings→Security (own password).

---

### 2.14 — STORE FRONT-END (`/store`, public)

**Components:** `EStoreApp.tsx`, `StoreFront.tsx`, `StoreProductModal.tsx`, `StoreDealModal.tsx`, `StoreCheckout.tsx`, `OrderTracker.tsx`, `useEstoreAuth.ts`.
**Guard:** if `!estoreEnabled` → full-screen "Store is Closed / Temporarily Offline". Banners: shop closed, pickup-only, out-of-range. Reads **directly from Supabase** (no offline storefront, bypasses syncEngine/local cache). Theme injects `--color-*` CSS vars; toggles dark by bg brightness. Cart persisted in `localStorage` `estore_cart`. WhatsApp FAB if enabled.

#### Sub-routes
- `/store` → StoreFront
- `/store/checkout` → StoreCheckout
- `/store/track?id=` → TrackPage → OrderTracker

#### StoreFront (catalog)
- Header: logo/name; "My Orders" (if logged in) or "Login"; cart icon w/ badge → cart drawer.
- Hero + search (products + bundles).
- Categories strip (sticky; only those with ≥1 active product).
- Deals & Offers (active bundles, schedule-aware, DealCountdown).
- Product grid (grouped by category when All+no search); card → `StoreProductModal` (if variant/modifier) or immediate add; inline +/− if in cart.
- Floating bottom cart button → drawer → "View Order" → `/store/checkout`.
- Modals: **StoreProductModal** (variant groups, Extra Topping selector, qty, live total, Add to Order); **StoreDealModal** (combo slot pickers + size tier + extra toppings, Add Deal to Cart); **Login modal** (name+phone → `loginOrRegister` customers row); **My Orders modal** (past store_orders, "Order Again" re-adds available items, drops unavailable silently).

#### StoreCheckout (customer checkout)
- Back → `/store`; "Checkout" title.
- Fulfillment mode: Delivery / Self Pickup (auto-resolved from settings + hours).
- Ordering-unavailable overlay if `!canOrder`.
- Form: Full Name*, Phone*; delivery → Address* + Nearest Place* + "Detect Location" (geolocation + radius check); Order Notes; pickup → store address + directions.
- Payment: Cash on Delivery (if `estoreCodEnabled`), Custom payment (if `estoreCustomPaymentEnabled`, maps to `paymentMethod:'digital'`).
- Order Summary (subtotal, delivery fee, total).
- **Place Order** (disabled if `!canOrder`/loading): auto-register/login customer; invoice via `get_next_invoice_number` RPC; build `StoreOrder` (`status:'pending'`, `cashier:'ONLINE_STORE'`); **`supabase.rpc('place_estore_order')`** (reserves stock, writes `store_orders`); on success → `navigate('/store/track?id=<invoice>')`.
- ⚠️ **No coupon/discount code entry** (`discountAmount` always 0). ⚠️ `estoreMinOrder` configured but **not enforced**.

#### OrderTracker (`/store/track`)
- Fetches `store_orders` by invoice; subscribes to **realtime `postgres_changes` UPDATE** → live status. Big status icon + text + live countdown (auto-`update({status:'delivered'})` on expiry). Shows items/total/delivery. "Continue Shopping" → `/store`.

#### Customer account
- Phone-only, passwordless (`useEstoreAuth`): `loginOrRegister` inserts/updates `customers`; `logout` clears localStorage. No profile/edit page, no password, no email verify.

#### Data Relations
- Customer order → `store_orders` (pending) → appears in `/online-orders` after sync. "Accept & Load to POS" → `preparing` + cart pushed to POS → POS finalize writes `fulfilledSaleId` → "Converted". Cancel → `cancelled` (24h prune). Settings `estoreEnabled` master switch. Inventory `showInEstore`/`estoreSortOrder` drive catalog.

#### ⚠️ Inconsistencies
1. `accepted` status unreachable.
2. No step-wise status control in OnlineOrdersPage.
3. No refund/return/print/assign there.
4. Cancel soft (24h prune).
5. `/store` network-dependent (no offline).
6. `estoreMinOrder` not enforced; no coupon code.
7. Custom payment mislabeled as `digital`.
8. "Order Again" silently drops unavailable products.
9. OrderProgress timeline folds ready/converted into Preparing/Delivered.
10. Product can be `showInEstore=true` with zero variants/stock.
11. Delivery-range check skipped if store coords unset.

---


---

# Phase 8: Deep Data Flows & Relationships

## 4. DEEP PAGE NAVIGATION & LINK MAP (The Hub System)

The system is organized into interconnected functional hubs. Unlike legacy POS systems, navigation is highly relational.

### 1. The POS Hub (`/pos`)
**Core Role:** The operational center for ringing up sales.
- **Navigates to:**
  - `ShortcutsModal` (via ⌨️ shortcut button)
  - `DraftsModal` (via Drafts button to retrieve saved carts)
  - `/online-orders` (via the Bell icon in the header if `estoreEnabled` is true; badge shows pending count)
  - `CustomerDetailModal` (via selecting a customer in the cart)
- **Data Cascades To:**
  - `/transactions` (Sales history and receipt re-printing)
  - `/inventory` (Deducts stock instantly upon checkout)
  - `/dashboard` (Updates Revenue Today and Flow Monitor widgets)
  - `/reports` (Sales and tax ledgers)

### 2. The Inventory Hub (`/inventory`)
**Core Role:** Centralized product, pricing, and stock management.
- **Sub-Tabs & Links:**
  - **Products:** Lists all products. Links to `ProductDetailHub` (for editing, adjusting stock).
  - **Restock:** Links to `BatchStockInSystem`. When you check "Record as Supplier Bill", it pushes data directly to `/suppliers` (Supplier Ledger).
  - **History:** Shows `purchase_records`. Deleting a record here triggers a stock reversal.
  - **Bundles:** Links to POS (shows up as a filter chip in the POS grid).
  - **Media:** Centralized image repository used by Products, Categories, and Settings.
- **Data Cascades To:**
  - `/pos` (Product availability, pricing, barcode scanning)
  - `/dashboard` (Low stock alerts)

### 3. The Financial Hub (`/transactions`, `/expenses`, `/suppliers`)
**Core Role:** Managing money movement (in and out).
- **Page Links:**
  - **Transactions (`/transactions`):** Returning a sale here directly updates `/inventory` (restores stock) and `/customers` (updates purchase totals).
  - **Expenses (`/expenses`):** Linked to `/suppliers`. If you record a payment in the Supplier Ledger, it generates a record in Expenses. Deleting that expense restores the supplier debt.
  - **Suppliers (`/suppliers`):** "Payables" widget on `/dashboard` routes directly here.

### 4. The Reporting Hub (`/dashboard`, `/reports`)
**Core Role:** High-level analytics and granular tracking.
- **Dashboard Widgets (Drill-downs):**
  - **Revenue Today / Flow Monitor:** Clicks route to `/reports/sales`.
  - **Payables:** Clicks route to `/suppliers`.
  - **Orders (Pending):** Clicks route to `/inventory/restock` (Purchase Orders).
- **Reports:** Independent viewer, relies entirely on DB state (`sales`, `expenses`, `stock_history`).

### 5. The eStore Hub (`/store`, `/online-orders`)
**Core Role:** External customer portal bridging into the local POS.
- **Page Links:**
  - `/store` (Public Frontend): Customers place orders here.
  - `/online-orders` (Admin Portal): Receives orders from `/store`.
- **Workflow:** When an order is "Accepted", it loads directly into the **POS Cart**. The cashier finalizes it like a normal sale, which then marks the online order as "Converted".

## 7. DEEP FLOW GUIDES (CRUD & LIFECYCLE)

This section contains step-by-step deep architectural guides for adding, editing, and managing core entities in the system.

### 7.1 Product Add & Edit Flow (`ProductModal.tsx` & `ProductDetailHub.tsx`)
**Component:** `src/components/inventory/ProductModal.tsx`
**Service:** `productsService.create` / `productsService.update`
**DB Tables:** `products`, `stock_history`, `variant_stock_history`, `purchase_records`

#### 1. Identity & Classification (Creation)
- **Name:** Checked against DB for duplicates before creation (Rule F1 guard). Duplicates throw a hard error.
- **Category:** String-based. If "Add New" is typed, it's stored directly on the product (categories aren't strongly typed relational entities).
- **Supplier:** Selected via dropdown. If a new name is typed, it creates a `suppliers` row inline before saving the product.
- **SKU/Barcode:** Auto-generated via `generateSku()` / `generateBarcode()` or scanned via CameraScanner. Duplicate barcodes are blocked.
- **Product Type:** `Simple` (standard), `Variable` (has child variants), `Service` (ignores stock), `Serialized` (requires IMEI/Serial at POS).

#### 2. Financials & Stock Setup (Creation)
- **Cost & Price:** `cost` (purchase cost) and `price` (retail price) must be ≥ 0.
- **Initial Stock:** If `trackInventory` is true and `stock > 0` is entered during creation:
  - The system creates the `products` row.
  - It IMMEDIATELY creates a `stock_history` row with `type: 'initial'`, `change_qty: stock`, and `balance_after: stock`. (Rule F2).
  - Note: *Editing* a product's stock directly from the edit modal later is usually disabled or discouraged; stock should be changed via "Stock Adjustment" or "Restock" in `ProductDetailHub`.

#### 3. Variants & Modifiers Setup
- **Variants:** When `productType` is 'variable', the user defines Variant Options (e.g., Size: S, M, L).
  - `ProductModal` generates a combinatorial matrix in `variantData[]`.
  - Each variant has its own `price`, `cost`, `sku`, `barcode`, and `stock`.
  - **Variant Stock (F22):** Any stock added to variants flows through `variant_stock_history` to ensure the ledger is accurate.
- **Modifiers & Add-ons:** Independent of variants. Add-ons track their own stock in `product_addons` and deduct individually during a sale.

#### 4. Edit Constraints (`ProductDetailHub.tsx`)
- **Inline Editing:** In `ProductDetailHub`, clicking "Edit" unlocks specific sections (Identity, E-Store, Status, Pricing).
- **Stock Modifying Restrictions:** 
  - Stock is modified via the "Stock Adjustment" modal (creates an `adjustment` log with a reason) or "Quick Restock" (creates `purchase_records` and `stock_in` log). 
  - Direct arbitrary editing of the integer in the main form is bypassed to prevent silent ledger corruption.

---

### 7.2 Customer Add & Edit Flow
**Component:** `CustomerModal.tsx` / Cart Quick-Add
**Service:** `customersService.create` / `customersService.update`

#### 1. Creation Flow
- **Fields:** Name and Mobile are mandatory. 
- **Tier Selection:** `retail` vs `wholesale` — dictates which price tier the customer automatically gets at the POS terminal.
- **Pricing Tier:** Dictates which price tier the customer automatically gets at the POS terminal. (RESOLVED — Credit Limit / credit sales removed.)

#### 2. Edit & Lifecycle
- (RESOLVED — Credit Balance Mutation section removed; no credit sales or Collect Payment.)
- **Deletion:** Deleting a customer does NOT cascade delete their sales. The sales remain in the DB for accounting purposes (assigned to a deleted ID/Guest).

---

### 7.3 Supplier Add & Edit Flow
**Component:** `SupplierModal.tsx`
**Service:** `suppliersService.create` / `suppliersService.update`

#### 1. Creation & Opening Balance
- **Identity:** Legal Entity (Name) and Business Mobile are mandatory.
- **Opening Balance:** If a non-zero "Initial Debt Balance" is entered during supplier creation:
  - The system creates the `suppliers` row.
  - It then triggers `suppliersService.recordBill` to instantly create an `AUTO-PURCHASE/OPENING` entry in `supplier_transactions` with the debt amount.

#### 2. Edit & Ledger Usage
- **Details Edit:** Name, phone, and tax identity can be changed.
- **Balance Mutation:** Like customers, balance is ONLY mutated via `SupplierLedger` ("Record Payment" creates an expense, "Record Bill" raises debt) or via purchasing stock.

---

### 7.4 Expense Add & Edit Flow
**Component:** `ExpenseModal.tsx`
**Service:** `expensesService.create` / `expensesService.update`

#### 1. Creation
- **Fields:** Description, Amount, Date, Category, and Payment Method (Cash/Card/Bank).
- **No Supplier Linking:** Currently, standalone expenses do NOT link to suppliers. (If you want to pay a supplier, you must do it via the Supplier Ledger, which automatically generates a linked expense).
- **Amount Constraint:** There is no strict positivity block natively in the input, but standard flow assumes positive values.

#### 2. Deletion
- **Cascade:** If an expense is linked to a `supplier_transaction` (because it was generated via a supplier payment), deleting the expense will cascade and delete the supplier transaction (Rule F16), restoring the supplier's debt balance.

---

### 7.5 Sales / POS Checkout Flow (The Atomic Core)
**Component:** `CheckoutPage.tsx`
**Service:** `salesService.create` -> `commit_sale` RPC

#### 1. Pre-Flight & Cart Building
- Cart gathers all items, applying bundle prices, deal overrides, variant selections, and modifiers.
- Global discounts (bill discount) or item-level discounts are calculated.
- If "Save Draft" is pressed, it is saved locally with `status: 'pending'`. Does NOT deduct stock.

#### 2. Settlement & Payment
- **Payment Method:** User selects Cash, Card, or Digital (Bank Transfer). (Split mixed tender also available.)
- **Atomic Cloud Commit:** 
  - `get_next_invoice_number()` fetches the next safe sequence.
  - Client sends JSON to `commit_sale` Postgres RPC.
  - **RPC execution (ATOMIC):** 
    - Checks if `source_order_id` is already fulfilled (Estore race condition guard).
    - Inserts `sales` row.
    - Loops over items: deducts `products.stock` and inserts `stock_history` (`type: 'sale'`).
    - Deducts variant stock via `variant_stock_history`.
    - Updates customer `totalPurchases`.
- **Rollback (Bill Edit F10):** If an old bill is being edited, the system creates the NEW bill first (deducts stock). If successful, it deletes the OLD bill (restores stock). If the old bill delete fails, it rolls back the new bill to prevent double-deduction.

---

### 7.6 Restock / Purchase Order Flow
**Component:** `PurchaseOrderSystem.tsx` & `BatchStockInSystem.tsx`
**Helper:** `commitStockInToInventory` (src/lib/stockInCommit.ts)

#### 1. Queueing
- User selects items manually or uses "Auto Reorder" (fetches products below `minStock`).
- Sets incoming Cost and Qty for each.

#### 2. Commit & Execute
- `commitStockInToInventory` executes as the single source of truth for all stock-in operations:
  - For each item: creates a `purchase_records` row.
  - Increases `products.stock` (or variant stock).
  - Writes `stock_history` (`type: 'stock_in'`).
  - If "Record as Supplier Bill" is checked and a supplier matches, it sums the total cost and creates a `supplier_transactions` bill, increasing the supplier's payable balance.

#### 3. Reversal (Rule F12 Single-Reversal)
- Deleting a purchase record from the "HISTORY" tab triggers an `adjustment_out` stock history entry to accurately deduct the erroneously added stock. It does not blindly overwrite the stock value.


---


---

# Phase 9: Known Gaps & Inconsistencies

## 5. GAPS / INCONSISTENCIES / DEAD CODE

| # | Page/Tab | Issue | Details |
|---|---|---|---|
| 2 | POS Checkout | No partial/under-payment | Cash requires paid≥total; card/digital can process ₹0. |
| 3 | POS | `CheckoutModal.tsx` orphaned | Deprecated; only `CheckoutPage` used by terminal. |
| 4 | POS | Return Mode no settlement wording | Negative-total sale still says "Process Payment". |
| 5 | Online Orders | `accepted` status unreachable | Accept jumps pending→preparing; no UI sets `accepted`. |
| 6 | Online Orders | No step-wise status control | ready/out_for_delivery/delivered only via POS conversion; `getNextStatus()` unused. |
| 7 | Online Orders | No refund/return/print/assign | Refunds must happen via POS. |
| 8 | Online Orders | Cancel is soft | Relies on 24h prune; stays visible until then. |
| 9 | Transactions | `handleDeleteSale` dead | Defined but never called; list inlines own delete (two paths). |
| 10 | Transactions | `<CheckoutModal>` in detail modal dead | `showCheckout` never true. |
| 11 | Transactions | No returns/refunds filter tab | Only sale-type toggle + status badge. |
| 12 | Transactions | No refund reason/method capture | Modal collects items/qty/amount only. |
| 13 | Transactions | Mobile rows lack inline edit/delete | Only via detail modal. |
| 14 | Expenses | `isAdmin` guards dead | Always true; anyone can edit/delete. |
| 15 | Expenses | `isManualOverride` w/o `overrideBy` | Boolean stored, no user captured. |
| 16 | Expenses | No category CRUD | Fixed `EXPENSE_CATEGORIES` constant. |
| 17 | Expenses | No supplier linkage | Supplies expense doesn't touch supplier balance. |
| 18 | Expenses | Negative amount allowed | No positivity check. |
| 19 | Inventory | `handleRemoveFromPO` undefined | Restock auto-mode trash → ReferenceError. |
| 20 | Inventory / PO | `purchase_orders` tables + service orphaned | No PO CRUD/GRN in UI; never written. |
| 21 | Inventory | `product_batches` deprecated | Stock-in never writes batch rows; `batches[]` vestigial. |
| 22 | Inventory | Categories not managed entities | `handleAddCategory` only sets form value; `state.categories` unused by product form. |
| 23 | Inventory | Role gating disabled | `isAdmin=true` hardcoded. |
| 24 | Inventory | Supplier modal omits fields | `businessType`/`paymentTerms`/`rating` not in form. |
| 25 | Suppliers | Supplier modal omits fields | Same as #24. |
| 26 | Customers | No loyalty/points; no credit-balance input | Only `priceTier`. (RESOLVED — credit sale system removed; `creditLimit`/`creditUsed` fields no longer exist) |
| 27 | Customers | `preferredCategories` dropped | In state but not rendered; cleared on edit. |
| 28 | Customers | Delete has no cascade | Linked sales remain. (RESOLVED — credit ledger removed, so no credit to clear) |
| 29 | Reports | Restock/Tax/Profit tabs missing | Restock=Inventory PurchaseHistory; Tax/Profit folded into Sales/Financial. |
| 30 | Reports | Customers table capped 20 / export all | Visual/export mismatch. |
| 31 | Reports | Suppliers report dual exporter | Shared `ExportButton` + manual Blob (redundant). |
| 32 | Discounts | **CRITICAL: edit/delete/status broken** | `discountsService` lacks `update`/`delete` → all throw, dispatch never runs. Discounts creatable only. |
| 33 | Discounts | Conditions + `isAutoApply` dead | `isDiscountApplicable()` never called; no auto-apply; conditions never enforced at POS. |
| 34 | Discounts | No promo-code entry at POS | Manual tap only. |
| 35 | Discounts | i18n "privilege" keys | Modal titled with discount/privilege mismatch. |
| 36 | Settings | No backup/restore/barcode-format sub-tab | Backup in Database; barcode format only in BarcodeGenerator. |
| 37 | Settings | No Reconcile button | `reconcileAllStock` (F11) only in InventoryManager. |
| 38 | Settings | `barcode*` settings no UI | `barcodeBarWidth` etc. in formData but not rendered. |
| 39 | Settings | `BackupTab.tsx` dead | Defined, never imported. |
| 40 | Settings | `CloudSyncTab.tsx` dead import | Imported, never rendered. |
| 41 | Settings | retailEnabled guard silent override | Disabling last sale type re-enables retail. |
| 42 | Users | **Entire route blocked** | `RequireAccess` returns false for `users` → redirect `/pos`. Inaccessible. |
| 43 | Dashboard | Orders card hardcoded 0 | `pendingPOsCount=0` placeholder. |
| 44 | Dashboard | Flow Monitor bar static | Not data-driven. |
| 45 | Dashboard | Live Feed rows non-clickable | No navigation to sale. |
| 46 | Dashboard | Hour-bucket uses UTC vs tz day | Possible off-by-timezone mismatch. |
| 47 | Store (`/store`) | Network-dependent | Reads Supabase directly; no offline. |
| 48 | Store | `estoreMinOrder` not enforced | Customers can order below minimum. |
| 49 | Store | No coupon code | `discountAmount` always 0. |
| 50 | Store | Custom payment mislabeled `digital` | May mislabel reports. |
| 51 | Store | "Order Again" silent drops | Unavailable products dropped w/o feedback. |
| 52 | Store | Delivery-range check skipped if no coords | Potential logic gap. |
| 53 | Global | Role logic removed | No admin/cashier/salesman distinction; `isAdmin=true` everywhere; users blocked. |
| 54 | Global | `CheckoutModal` vs `CheckoutPage` parity | GEMINI requires parity but terminal only uses CheckoutPage. |

---

*End of SYSTEM MAP. No code was edited, pushed, or modified during this audit.*


### GAPS / INCONSISTENCIES FOUND (Alternate)

| Page/Tab | Issue | Details |
|---|---|---|
| POS | **No calculator component** | Amount entry is plain numeric input in CheckoutPage; no calculator popup. |
| POS | **No standalone Discount modal** | Discounts are inline (per-item panel + bill-discount row + Promotion modal). |
| POS | **No cash-drawer open/close UI** | Only Mobile Cart Drawer + Mobile menu Drawer exist. |
| Settings | **Dead/legacy files** | `BackupTab.tsx` (unused), `ActionHistory.tsx` (`@deprecated`, no render), `AuditTimeline.tsx` (imported in InventoryManager but never rendered). |
| Settings/Database | **CloudSyncTab Electron-only** | Not present in web/PWA build. |
| Reports | **No dedicated Tax tab** | Tax embedded in SalesReport/ReceiptPreview/FinancialReport. |
| Inventory | **`suppliers` legacy sub-tab reference** | `InventoryManager.tsx:1176-1177` leftover; real suppliers at `/suppliers`. |
| RBAC | **Roles display only** | `profile.role` shown in header but gates nothing; `users` route blocked for all non-admins uniformly. |
| saveProgressively | **5-min delete guard** | A record deleted <5 min before a device reconnects may linger locally up to 5 min (rare). |

---

*End of ULTRA-DEEP FULL SYSTEM MAP. All entries verified against `src/` code. No code changes made.*


---


---

