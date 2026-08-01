# UI Unification Migration — todo.md

Goal: migrate ALL routes (Settings, /store estore, admin, reports, inventory) onto shared modules with ZERO visual change. POS (`src/components/pos/**`) is the ONLY exemption.

## ✅ PHASE 1 — Core Migration (COMPLETE, v3)
- [x] A: auth + layout + customers + expenses + users
- [x] B: inventory core 1
- [x] C: inventory core 2
- [x] D: suppliers + discounts + transactions
- [x] E: reports + settings + orders + dashboard
- [x] F: sonner options fix + straggler alerts
- [x] G: dead CSS cleanup
- [x] H: hand-rolled skeletons → SkeletonLoader (documented skip: POS-flow micro-loaders)
- [x] I: AGENTS.md + GEMINI.md updates
- [x] J: full tsc + build verification

## ✅ PHASE 2 — 100% Coverage: Settings + Estore + Select (COMPLETE, v4)
- [x] Create shared `Select` wrapper (`src/shared/ui/Select.tsx`) + barrel export
- [x] Migrate ALL 20 native `<select>` in 9 non-POS files → shared `Select`
- [x] Settings.tsx: 4 remaining raw preset-chip buttons → `Button` (+ `!min-h-0`)
- [x] Estore FULL migration: 40 raw buttons → `Button` with `!`-overrides preserving theme-var visuals
- [x] AGENTS.md rule 17 → "MANDATORY — 100% COVERAGE": POS only exemption
- [x] GEMINI.md UI Components → "100% COVERAGE, POS-exempt"
- [x] tsc + build verification ✅

## ✅ PHASE 3 — Quick Restock + Shared Stock-In Commit Path (COMPLETE, v5)
- [x] `src/lib/stockInCommit.ts` — `commitStockInToInventory()` single shared commit path
- [x] `PurchaseOrderSystem.handleBulkAdmit` → refactored to shared helper
- [x] `ProductDetailHub` → `+ RESTOCK` button + Quick Restock panel (BottomSheet lg, 2-col grid, inline supplier validation, supplier-bill toggle)
- [x] tsc + build verification ✅

## ✅ PHASE 4 — Docs Refresh (COMPLETE, v5)
- [x] `docs/MODULES.md` created — live registry: `shared/ui` (13), `shared/modules/search-and-list`, shared `lib` logic (`stockInCommit` etc.), sanctioned `common/`, hard bans, new-module checklist
- [x] AGENTS.md — rule 7 + 17 → reference MODULES.md; NEW rule 18 "MODULES.md LIVE REGISTRY (must stay up to date)"; Reference Docs table updated
- [x] GEMINI.md — rule 5 + Agent rule 7 → reference both docs; NEW rule 11 "MODULES.md LIVE REGISTRY"; UI Components section → MODULES.md link + stockInCommit entry
- [x] `docs/UI_RULES.md` — old 332-line content REMOVED → fresh short module-based version (shared-modules table, tokens, buttons, modals, checklist)

## 📊 Final State (v5)
- 53 files importing `shared/ui` (was 47)
- Native `<select>` outside POS: **0** (was 20)
- Raw `<button>` outside POS: 27 files — ALL intentional common components (Modal, DialogProvider, SearchableSelect, TouchKeyboard, HelpTooltip, CameraScanner, StickyFormFooter, ToppingAssignmentPanel, ExtraToppingSelector + interactive chips/list rows)
- `npx tsc --noEmit` → clean · `npm run build` → ✅ PWA generated

## ✅ PHASE 5 — Unified Export & Reporting (COMPLETE, v6)
- [x] Phase 0 audit: bucket (a) hand-rolled exports, (b) DB backup, (c) POS receipts — exclusions defined (BackupTab/DatabaseTools/InventoryManager JSON backup; pos/ReceiptPrint + KOTPrint; barcode labels)
- [x] `src/shared/export/exportEngine.ts` — CSV (BOM+title+filter rows), Excel (SheetJS), PDF (jsPDF v4 native table, emerald branded header, page footers), print (branded HTML), triggerDownload, DEFAULT_BRAND
- [x] `src/shared/export/ExportButton.tsx` — desktop dropdown / mobile BottomSheet, compact icon-only mode, maxRows guard, busy+success states; barrel `index.ts`
- [x] AppIcons: `download`, `spreadsheet`, `fileDown`, `table` added; `xlsx@0.18.5` installed
- [x] Migrated: SuppliersReport, TransactionsManager, PurchaseHistory, InventoryReportManager, PurchaseOrderSystem (CSV+print removed), ReportsManager (dead exportReport deleted), SalesReport, ExpensesReport, CustomersReport, FinancialReport (summary metrics), ActionHistory, AuditTimeline
- [x] docs/MODULES.md — new "4. Unified Export & Reporting" section + hard ban row + checklist update (SAME change, rule 18)
- [x] docs/UI_RULES.md — export row in shared table + new "6. EXPORT & PRINT" section + checklist item
- [x] tsc clean + build ✅

## 📊 Final State (v6)
- All bucket-(a) reports export via `src/shared/export` ONLY — zero hand-rolled CSV/print outside POS
- tsc --noEmit clean (noUnusedLocals) · npm run build ✅
