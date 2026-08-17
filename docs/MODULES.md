# 🧱 SHARED MODULES REGISTRY — SINGLE SOURCE OF TRUTH

> **THE ONE RULE (🛡️ ANTI-AI BREAKABLE MANDATE):** Har page, har route, har component (except `src/components/pos/**`) ka har UI primitive, search/list/drag module, aur shared business logic STRICTLY SAME shared module se aata hai — **kabhi page-local copy/variant nahi banate.** POS (`src/components/pos/**`) is the ONLY exemption. NO AI OR DEVELOPER MAY BUILD CUSTOM UI COMPONENTS for standard things like popups, buttons, icons, or media selection. Use the existing ones.
>
> ⚠️ **STAY UP TO DATE (MANDATORY):** This file is the live registry. When you add a new shared module, change a shared component's API, or add a new shared helper — **update this file in the SAME commit/change.** A stale MODULES.md is a violation.

---

## 📦 1. Shared UI Library — `src/shared/ui/`

Import from barrel: `import { Button, Badge, Select } from '../../shared/ui';`

| Component | Props (highlights) | Replaces |
|-----------|--------------------|----------|
| `Button` | `variant: primary\|secondary\|danger\|ghost`, `size: sm\|md\|lg`, `icon`, `iconPosition`, `loading`, `fullWidth` | All raw `<button>` Tailwind strings |
| `Card` | `variant: default\|stat\|premium\|glass\|listRow`, `padding: none\|sm\|md\|lg` | Bespoke card divs |
| `Badge` | `tone: success\|warning\|danger\|info\|neutral`, `size: sm\|md`, `variant: soft\|solid\|outline` | Inline status pills |
| `SegmentedControl` | `options: {label,value}[]`, `value`, `onChange`, `size` | Segmented tab bars |
| `ToggleSwitch` | `checked`, `onChange`, `size: sm\|md`, `color`, `disabled`, `label` | Copy-pasted switch toggles |
| `SubTabBar` | `tabs: {id,label,icon?}[]`, `value`, `onChange` | Chip tab bars |
| `Avatar` | `src`, `name`, `size: sm\|md\|lg\|xl`, `shape: circle\|square` | Gradient-initials thumbnails |
| `Pagination` + `usePagination` | `page`, `totalPages`, `onPageChange`, `mode: numbered\|prevNext` | All pager copies |

| `DateRangePicker` | `preset`, `presets`, `startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`, `label`, `icon` | Duplicate date-range filter rows |
| `EmptyState` | `icon`, `title`, `subtext`, `action`, `compact` | Bespoke empty states |
| `BottomSheet` | `open`, `onClose`, `title`, `subtitle`, `maxWidth`, `footer`, `snapPoints` | Mobile-native sheets (slides up mobile / centered desktop) |
| `Select` | `value`, `onChange`, `className`, `fullWidth`, `disabled` + all native `select` attrs | ALL native `<select>` elements |

**Rules:**
- Presentation + interaction only — NO Supabase/Dexie calls, NO business logic inside `src/shared/ui/*`.
- Dark mode via single `bg-surface` token — never `dark:bg-[#1C1C1C]`-style hex literals.
- Visual tweaks: `!`-prefixed `className` overrides (estore theme vars `--color-primary`, `--color-card-bg`, etc.) — NEVER new markup, NEVER page-local variants.
- New shared component? Create it in `src/shared/ui/`, export from `index.ts`, register it in this file.

---

## 🔍 2. Search / List / Drag Modules — `src/shared/modules/search-and-list/`

Import: `import { SharedSearchBar, SharedProductList, useDragDropList } from '../../shared/modules/search-and-list';`

| Module | Usage | Banned alternative |
|--------|-------|--------------------|
| `SharedSearchBar` | ALL search inputs on non-POS routes | Hand-rolled search inputs |
| `SharedProductList` + `SharedProductListItem` | ALL product/item listing rows + result lists | Bespoke list rows |
| `SharedDragDropList`, `useDragDropList`, `DragHandle`, `DRAG_ROW_CLS` | ALL reorderable lists | Local `dragIndex` / `dataTransfer` / `GripVertical` implementations |

**Exception:** `SearchableSelect` (`src/components/common/SearchableSelect.tsx`) is an allowed select primitive (supplier/category pickers).

---

## ⚙️ 3. Shared Business Logic Modules — `src/lib/`

| Module | Purpose | When to use |
|--------|---------|-------------|
| `services.ts` | All DB services (`productsService`, `purchaseRecordsService`, `suppliersService`, ...) | Every DB call — never raw supabase calls in components |
| `localDb.ts` | Dexie IndexedDB + `queueOp` offline-first queue | Every local read/write |
| `syncEngine.ts` | Local↔Supabase delta sync, retention pruning | Startup only |
| `stockInCommit.ts` | `commitStockInToInventory()` — THE single stock-in commit path (PO bulk + Quick Restock) | ANY stock-in operation |
| `sonner.ts` | `sonner.toast / confirm / loading / success / error` | ALL toasts + confirmations |
| `currencies.ts` | `formatCurrency`, `getCurrencySymbol`, `formatNumberWithPrecision` | ALL money formatting |
| `icons.ts` | `AppIcons` registry — THE icon source of truth | ALL icons on headers/nav/drawers/menus |
| `imageCompression.ts` | `compressImage` (WebP, 20-50KB target) | ALL image compression |
| `translations.ts` + `hooks/useTranslation.ts` | `t(key, fallback)` i18n | ALL UI strings |
| `dialog.tsx` + `components/common/DialogProvider.tsx` | `sonner.confirm/alert/prompt` dialogs | Simple confirmations |

---

## 📤 4. Unified Export & Reporting — `src/shared/export/`

**THE only export path for all reports/actions app-wide.** Hand-rolled CSV/print/Excel/PDF code is BANNED everywhere except `src/components/pos/**` (receipts/KOT stay self-contained) and full DB backup (see exclusions).

Import: `import { ExportButton, exportToCSV, exportToPDF, printReport } from '../../shared/export';`

| Module | Purpose |
|--------|---------|
| `exportEngine.ts` | `exportToCSV` (BOM + title/filter/timestamp rows), `exportToExcel` (SheetJS), `exportToPDF` (jsPDF landscape, branded emerald header, `doc.table` by header label, page footers), `printReport` (branded print HTML), `triggerDownload`, `defaultFilename`, `safeFilename`, `formatValue`/`excelValue`, `DEFAULT_BRAND` |
| `ExportButton.tsx` | `data`, `columns` (`{key,label,format?}`), `title`, `subtitle?`, `filtersSummary?`, `formats?` (`csv\|excel\|pdf\|print`), `compact?` (icon-only), `maxRows?`, `currencySymbol?`, `brand?` — desktop dropdown / mobile BottomSheet, busy+success states |

**Rules:**
- ALWAYS export the **currently filtered dataset** — never the full unfiltered table.
- All outputs carry branded header + timestamp + active-filter summary.
- Reports migrated so far: Sales/Expenses/Customers/Suppliers/Financial tabs, TransactionsManager, PurchaseHistory, InventoryReportManager, PurchaseOrderSystem, ActionHistory, AuditTimeline.
- ❌ **Excluded:** full DB backup (JSON) — `BackupTab`/`DatabaseTools`/`InventoryManager` stay separate; POS receipt/KOT print — `pos/ReceiptPrint.tsx`, `pos/KOTPrint.tsx`; barcode label printing.

---

## 🧩 5. Sanctioned Common Components — `src/components/common/`

These are app-level shared components (NOT page-local). Reuse them; never re-implement.

| Component | Purpose |
|-----------|---------|
| `Modal` | THE only overlay implementation (mobile slide-up / desktop centered, `maxWidth` lg/xl for forms, 2-col grid `md:grid-cols-2`) |
| `BottomSheet` (shared/ui) | wraps `Modal` — use for action panels |
| `DialogProvider` | confirm/alert/prompt system |
| `SkeletonLoader` | THE only primary loader (shimmer) — generic spinners banned |
| `MediaLibrary` | THE only image upload/selection path (compress + reuse) — direct file triggers banned |
| `SearchableSelect` | Searchable dropdown primitive (allowed exception) |
| `CameraScanner` | Barcode/QR camera scan |
| `StickyFormFooter` | Sticky save/cancel footers on long forms |
| `TouchKeyboard` | Custom on-screen keyboard |
| `HelpTooltip` | Info tooltips |
| `ToppingAssignmentPanel`, `ExtraToppingSelector`, `BarcodePreview`, `HighlightBadge` | Niche helpers |

---

## 🚫 6. Hard Bans (everywhere except `src/components/pos/**`)

- ❌ Raw `<button className="...">` Tailwind strings → use shared `Button`
- ❌ Native `<select>` → use shared `Select` (or `SearchableSelect` exception)
- ❌ Bespoke card divs / inline badge pills → `Card` / `Badge`
- ❌ Copy-pasted toggle / tab / avatar / pager / date-range markup → shared primitives
- ❌ Hand-rolled `fixed inset-0` overlays → `Modal` / `BottomSheet` only
- ❌ Generic spinner loaders for primary routes → `SkeletonLoader`
- ❌ Direct file upload triggers → `MediaLibrary` only
- ❌ Raw Lucide imports where an `AppIcons` mapping exists → `AppIcons` first
- ❌ Page-local variants of ANY shared module — visual tweaks ONLY via `!`-prefixed className overrides
- ❌ Second parallel implementation of shared business logic (e.g. stock-in) — `stockInCommit` is the only path
- ❌ Hand-rolled CSV/Excel/PDF/print code (Blob + `download` attr, `window.print`) → `src/shared/export/` only

---

## ✅ 7. New Shared Module Checklist

When adding any new shared module/component/helper:
1. Create under the correct `src/shared/**` (UI → `shared/ui`, search/list/drag → `shared/modules/search-and-list/`, export → `shared/export/`, logic → `src/lib/`)
2. Export from the barrel (`src/shared/ui/index.ts` or module `index.ts`)
3. **Register it in this MODULES.md registry (SAME change — mandatory)**
4. Update `docs/UI_RULES.md` if it affects design rules
5. No business logic in `shared/ui` components; no page-specific naming
