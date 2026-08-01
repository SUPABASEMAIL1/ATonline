# 🎨 Zaynahs POS — UI DESIGN RULES (SHORT & SHARP)

> **THE ONE RULE:** Poora app — har route, har page, har component — SAME shared modules use karta hai. `src/components/pos/**` is the ONLY exemption. Page-local variants, hand-rolled markup, alag-alag lookalikes = **BANNED**.
>
> ⚠️ **STAY UP TO DATE (MANDATORY):** Ye rules live source of truth hain — koi bhi UI pattern/rule change, ya naya shared module add, toh `docs/UI_RULES.md` AND `docs/MODULES.md` DONO ko SAME change mein update karo (see AGENTS.md rule 18 / GEMINI.md rule 11). Stale docs = violation.

## 0. MANDATORY READS BEFORE ANY UI CODE
1. [docs/MODULES.md](MODULES.md) — complete shared module registry (props, bans, "stay up to date" rule)
2. This file

---

## 1. SHARED MODULES ONLY (100% COVERAGE, POS-exempt)

| What you need | Use THIS (shared) | NEVER hand-roll |
|---------------|-------------------|-----------------|
| Button | `Button` from `../../shared/ui` (`variant`, `size`, `icon`, `loading`, `fullWidth`) | `<button className="...">` strings |
| Card / panel | `Card` | Bespoke card divs |
| Status pill | `Badge` (`tone`, `size`, `variant`) | Inline pill divs |
| Toggle | `ToggleSwitch` | `w-9 h-5` switch markup |
| Tabs | `SegmentedControl` / `SubTabBar` | Chip tab markup |
| Avatar | `Avatar` | Gradient-initials divs |
| Pager | `Pagination` + `usePagination` / `LoadMoreButton` | Prev/Next copies |
| Date range | `DateRangePicker` | Date filter rows |
| Empty state | `EmptyState` | Empty divs |
| Select | `Select` (or `SearchableSelect` common primitive) | Native `<select>` |
| Search input | `SharedSearchBar` | Search inputs |
| Product list rows | `SharedProductList` / `SharedProductListItem` | Bespoke list rows |
| Drag reorder | `useDragDropList` + `DragHandle` | `dragIndex`/`dataTransfer`/`GripVertical` |
| Overlay | `Modal` / `BottomSheet` | `fixed inset-0` overlays |
| Confirm/alert | `sonner.confirm` (DialogProvider) | Custom dialogs |
| Primary loader | `SkeletonLoader` | Generic spinners |
| Image upload | `MediaLibrary` | Direct file inputs |
| Icons | `AppIcons` from `src/lib/icons.ts` (fallback: Lucide) | Raw Lucide if mapped |
| Money | `formatCurrency` from `src/lib/currencies` | Manual formatting |
| Stock-in commit | `commitStockInToInventory` from `src/lib/stockInCommit` | Second parallel impl |
| Export (CSV/Excel/PDF/print) | `ExportButton` + engine from `src/shared/export` | Blob + `download` attr, `window.print()`, hand-rolled CSV |

**Visual tweaks:** shared component par `!`-prefixed `className` overrides (`!bg-amber-500`, `!min-h-0`) — estore theme vars (`--color-primary`, `--color-card-bg`) isi tarah apply hote hain. Never new markup.

---

## 2. DESIGN TOKENS (NO HARDCODED COLORS)

- Colors ONLY via CSS vars: `bg-primary`, `bg-surface`, `bg-app`, `text-default`, `text-muted`, `border-default`, `text-danger`, `text-success`, `text-warning`
- Dark mode: single `bg-surface` token — `dark:bg-[#hex]` banned
- Brand: `--color-primary` (emerald) — eshtore theme var se override hota hai

## 3. BUTTONS

- All via shared `Button` (built on `.btn` CSS: min-height 44px, uppercase, `active:scale-95`, disabled state)
- `size="md"` (`btn-md`) is DEFAULT — all new buttons include it unless overriding
- Variants: `primary` (save/confirm), `secondary` (cancel/back), `danger` (delete), `ghost` (subtle)
- Compact buttons: `!min-h-0 !p-*` overrides (e.g. chips, inline actions)

## 4. MODALS & OVERLAYS

- `Modal` or `BottomSheet` ONLY — hand-rolled overlays banned; one z-ladder (`Modal` z-1000, DialogProvider z-9999)
- Mobile (<768px): Modal slides up full-width rounded-top (centered layout `items-center justify-center` — NEVER bottom-anchored sheets)
- Desktop: centered dialog
- **Sizing:** forms/pages use `maxWidth="lg"` or `"xl"` (never sm/md) + 2-col grid `md:grid-cols-2` on desktop
- `BottomSheet` = Modal wrapper + drag grip; use for action panels

## 5. LOADING & EMPTY

- Primary/route/grid loaders: `SkeletonLoader` shimmer — spinners banned
- `EmptyState` for no-data states; `sonner` for toasts/confirmations

## 6. EXPORT & PRINT

- `ExportButton` (from `src/shared/export`) on ALL report/action views — exports the **currently filtered dataset**, never full unfiltered
- Branded header + timestamp + active-filter summary in every output (CSV/Excel/PDF/print)
- Desktop: dropdown menu; mobile (<768px): `BottomSheet` picker
- `compact` prop = icon-only button (fits table headers / control bars)
- Exempt: POS receipts/KOT (`src/components/pos/**`), full DB JSON backup

## 7. ENFORCEMENT CHECKLIST (before committing UI code)

- [ ] `src/shared/ui` + shared modules used — zero page-local variants
- [ ] No raw `<button>` / native `<select>` / bespoke cards-pills-toggles outside POS
- [ ] No hardcoded hex colors; dark mode = `bg-surface`
- [ ] Modal `lg`/`xl` + `md:grid-cols-2`; mobile centered
- [ ] `SkeletonLoader` for primary loaders
- [ ] Icons via `AppIcons` where mapped
- [ ] Exports via `src/shared/export` — no Blob/window.print copies
- [ ] New shared module? → registered in [docs/MODULES.md](MODULES.md) (SAME change)
