# 🤖 AI AGENT OPERATING RULES

> ⚡ **Supabase Management API Only** — All database operations MUST use the `sbp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` token + curl/API.
> Prisma and direct DB connections have been completely removed. See [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for complete API reference.

---

## 🚀 MANDATORY ALL-PROJECT PUSH RULE (MANDATORY)

- **Push Everywhere:** Whenever you make ANY code change, bug fix, or schema update, you MUST ALWAYS push the updated code to ALL 4 projects immediately. 
- **Command:** `git push origin main && git push atonline main && git push minimahalpos main && git push pizzamilano main`
- **Never Skip:** Never assume a fix is just for one project. Code updates must be synced globally so all clones stay 100% identical.



## 🌍 UNIVERSAL REUSABILITY RULE (MANDATORY)

- **Code is Universal:** This system is designed for **multiple clones/shops**. NEVER fix a bug, UI issue, or add a feature in a "shop-specific" or "one-off" way.
- **Global Code Changes:** ALL fixes (whether it's CSS, layout, logic, or bug fixes) MUST be implemented in the core codebase (`src/`, `index.css`, `shared/`) so that the exact same code runs universally across all current and future clones.
- **Future-Proofing:** Every time you write code, ask yourself: *"Will this work seamlessly on the next new clone without any manual changes?"* If the answer is no, your code is wrong.



## 🚀 CI/CD Deploy Rules (GitHub Actions + Cloudflare Pages)

- **NEVER** use `${{ github.event.repository.name | lower }}` (or any `| filter` expression) inside a workflow `command:` field — it silently breaks GitHub Actions parsing (runs fail with 0 jobs, workflow name shows as file path, NO deploy happens).
- Always compute dynamic values in a shell step first, then pass via output:
  ```yaml
  - name: Set Cloudflare project name
    id: cfname
    run: echo "name=$(echo '${{ github.event.repository.name }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"
  # ...then use: command: pages deploy dist --project-name ${{ steps.cfname.outputs.name }}
  ```
- After ANY `.github/workflows/*` change: push to ALL 4 repos, then verify the run shows the REAL workflow name (not the file path) and jobs > 0 before assuming it works.
- **DEPLOY RULES (MANDATORY):** Deploy se pehle ALWAYS `env_backups/` folder dekho (har shop ka apna file: `JEANZONE-ENV`, `ATOLINE-ENV`, `minimahal-pos.env.local`, `.env.local.pizza-milano...`) — credentials wahi se lo, kabhi guess/other-shop token mat use karo. "All/sab" kaha jaye to hi 4 repos push karo (`origin` = jeanzone, `atonline`, `minimahalpos`, `pizzamilano`); specific shop ka naam ho to SIRF usi ka remote push karo. Har push ke baad GH Actions + CF/Vercel deployment verify karo (completed/success + READY) — bina verify "done" mat bolo.
- Full Cloudflare Pages + Vercel deploy setup/verify guide: [docs/setup.md](docs/setup.md) → "Deploy Guide (Cloudflare Pages + Vercel)" section — Section 0 (mandatory flow), 1 (deploy map + env_backups mapping), 1a/1b (push commands), 5 (workflow examples). Har shop ka apna CF account + token hai — kabhi galat account par project mat banao.

---

## 📌 Core DB Operations (Management API)

| Operation | Method |
|-----------|--------|
| Run SQL | `POST https://api.supabase.com/v1/projects/{ref}/database/query` — Bearer `$SUPABASE_MGMT_API_KEY` |
| Get API keys | `GET https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true` — Bearer `$SUPABASE_MGMT_API_KEY` |
| List projects | `GET https://api.supabase.com/v1/projects` — Bearer `$SUPABASE_MGMT_API_KEY` |
| Create project | `POST https://api.supabase.com/v1/projects` — Bearer `$SUPABASE_MGMT_API_KEY` |
| Storage ops | Use `$SUPABASE_SERVICE_KEY` (get via Management API) |
| Auth admin | Use `$SUPABASE_SERVICE_KEY` + `$SUPABASE_ANON_KEY` (get via Management API) |

> 🔍 **Get project ref:** Project ref is the subdomain in `https://{ref}.supabase.co`. Or list all projects:
> ```bash
> curl -s "https://api.supabase.com/v1/projects" \
>   -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
> ```

---

## 🏢 Business Scope & Safety Rules
- **Applies to:** Universal Business System (Clothing, Pharmacy, Restaurant, Retail, Electronics, Mobile, Tech, Shoes, Grocery). NO logic or layout may be hardcoded to a specific niche.
- **Enforced Terminology:** `item` / `product` / `unit` / `category` / `listing` / `variant` / `modifier` / `addon`.
- **Electronics / Tech Tracking:** The system fully supports Serial Number and IMEI tracking via `requireSerial` and `serialNumber` fields. Never assume the POS is only for food or basic retail.

---

## 🧠 Agent Rules
0. **Architecture**: 1 Clone = 1 Shop. Never use workspace_id or shift_id.

1. **Think Before Acting**: Analyze, break into steps, avoid unnecessary complexity
2. **Code Quality**: Clean, readable, modular, DRY
3. **Project Awareness**: Read existing files, respect architecture, do NOT rewrite unnecessarily
4. **Minimal Scanning**: Only read files directly related to the task
5. **File Verification**: Before editing a component, verify its actual usage in `App.tsx`
6. **DATA SAFETY**: Never make changes that could corrupt financial data without explicit confirmation
7. **🎨 STRICT UI PROTOCOL**: NEVER write a single line of UI code, CSS, or Tailwind without reading [docs/UI_RULES.md](docs/UI_RULES.md) and [docs/MODULES.md](docs/MODULES.md) FIRST. Aesthetic consistency is non-negotiable — always the same shared modules, everywhere.
8. **📏 SIZING RULE (MANDATORY)**: For all new pages and components, Modals MUST use `maxWidth="lg"` or `"xl"` (never sm or md for forms) with a 2-column grid (`md:grid-cols-2`), and ALL buttons MUST include `.btn-md` by default unless specifically overriding.
9. **📱 MOBILE MODAL RULE (MANDATORY)**: All Modals, Popups, and Drawers (including Cart) MUST be displayed in the center of the screen on mobile devices (`items-center justify-center`). NEVER use bottom sheets (`items-end` or `justify-end`) for modals.
10. **Fulfill the Request**: Modify, refactor, or create exactly what the user asks without hesitation.
11. **Design Parity**: Maintain "Expert Density" aesthetic and established design patterns.
12. **Direct Action**: Find the relevant files and implement the fix directly.
13. **Strict Database Policy (NO PRISMA)**: Direct DB connections, Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`), and Prisma ORM are completely banned. You must strictly use the Supabase Management API via HTTP/curl for all database schema and data control. Refer to [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for the exact API specifications.
14. **🖼️ CENTRALIZED MEDIA SELECTOR & COMPRESSION (MANDATORY)**: All image uploads or selection workflows (products, deals, settings, logo, etc.) MUST route strictly through the centralized `MediaLibrary` component. Direct file upload triggers are banned outside the library. This enforces automatic image compression (WebP, 20-50KB target) via `compressImage` and permits image reuse across the database.
15. **💀 SKELETON LOADING RULE (MANDATORY)**: All loading states for main layout switches, routes, or grid views (storefront, product grid, list pages) MUST use the centralized `<SkeletonLoader />` component (`src/components/common/SkeletonLoader.tsx`) to provide a premium, smooth shimmer load experience. Generic spinner loaders are strictly prohibited for primary loaders.
16. **🔍 SHARED SEARCH/LIST/DRAG MODULE RULE (MANDATORY)**: All search inputs on non-POS routes MUST use `SharedSearchBar`; all item/product listing rows and result lists MUST use `SharedProductList` / `SharedProductListItem`; all reorderable lists MUST use the shared drag-and-drop module (`useDragDropList` + `DragHandle`) — local `dragIndex`/`dataTransfer`/`GripVertical` implementations are banned. Modules live in `src/shared/modules/search-and-list/`. The POS route is exempt; `SearchableSelect` (common select primitive) is an allowed exception.
17. **🧱 SHARED UI COMPONENT LIBRARY RULE (MANDATORY — 100% COVERAGE)**: ALL UI primitives on ALL routes EXCEPT `src/components/pos/**` MUST come from `src/shared/ui/` — `Button`, `Card`, `Badge`, `SegmentedControl`, `ToggleSwitch`, `SubTabBar`, `Avatar`, `Pagination`, `DateRangePicker`, `EmptyState`, `BottomSheet`, `Select`. Hand-rolled `<button>` Tailwind strings, bespoke card divs, inline badge pills, native `<select>`, copy-pasted toggle/tab/avatar/pager/date-range markup are BANNED everywhere except `src/components/pos/**`. Import from the barrel: `import { Button, Badge, Select } from '../../shared/ui';`. Components accept `className` escape hatches (estore theme vars). **POS is the ONLY exemption.** Chahay naya code ho (new feature) ya purana code ho (old legacy/refactor), har jagah sirf aur sirf shared modules use karne hain. Estore (`src/components/estore/**`) and Settings are FULLY migrated — estore keeps its CSS-variable theme system via `!`-prefixed className overrides on shared wrappers; new estore code MUST use the shared wrappers too. **Same-module consistency:** every new page/component MUST use these exact same modules — never create page-local variants of Button/Card/Badge/Toggle/Select/Pagination/DateRange/EmptyState/Avatar. Visual tweaks go through `className` overrides (prefixed `!`), never new markup. Complete module registry: [docs/MODULES.md](docs/MODULES.md).
18. **📚 DOCS STAY CURRENT RULE (MANDATORY)**: `docs/MODULES.md` (shared module registry) and `docs/UI_RULES.md` (design rules) are the live source of truth — **always kept up to date**. When you create a new shared module/component/helper, change a shared module's API, or change any UI rule/pattern, you MUST update BOTH docs in the SAME change — a stale registry is a violation. All new shared modules go under `src/shared/**` with barrel export; duplicate/parallel implementations of shared business logic (e.g. stock-in commit path) are BANNED — always import the existing shared one.

---

## 🔴 FINANCIAL INTEGRITY RULES

See [GEMINI.md](GEMINI.md) sections F1-F11 for complete financial rules:
- F1: Duplicate Product Prevention
- F2: Stock History Is Mandatory
- F3: Dual Batch Sync (products.stock, product_batches.qty_remaining, products.batches[])
- F4: Bill Edit Must Be Atomic
- F5: Purchase Cost Must Never Be Zero Silently
- F6: Reports Must Query DB Directly
- F7: Shift System Is REMOVED (permanent) — no shift tables/columns ever, anywhere in any clone
- F8: Stock Audit Function
- F9: Purchase Record Deletion Must Restore Batches + Log History
- F10: Bill Edit Rollback On Failure (Both CheckoutModal + CheckoutPage)
- F11: Reconcile Tool Must Exist (reconcileAllStock + UI button)

## 🔴 AUDIT-GRADE RULES (F12-F22 — from the 2026-08-12 full-project audits)

- **F12 — Single-Reversal Rule:** Every stock reversal happens EXACTLY once, inside the owning service (`salesService.delete`, `returnSale`, `purchaseRecordsService.delete`). UI handlers must NEVER reverse stock again after calling a service (PurchaseHistory double-reversal was -2×Q on cloud). Deleting ANY purchase record (Stock IN / Adjustment — signed quantity) reverses its ledger effect with ONE 'adjustment_out' history entry.
- **F13 — Draft Rule:** Drafts (`status:'pending'` / `DRAFT_SALE`) are saved carts, NOT revenue: they must never deduct/restore stock, never touch customer stats, never appear in `getReportSales`. Guards: `salesService.create`/`delete` (skipStockEffects) + report filters `.neq('status','pending')`.
- **F14 — Never Truncate Financial Data:** NO `.limit()` or `.slice(0, N)` on sales/expenses/payments/refunds for totals or reports. Use `fetchAllPages()`. state.sales must hold ALL sales (list views paginate themselves).
- **F15 — Partial-Refund Dedupe:** Never `[...reportSales, ...reportRefunds]` blindly — `partially_refunded` appears in BOTH; merge by sale id (sales copy wins) or refunds subtract twice (revenue corruption).
- **F16 — Wallet Collections:** Refund payouts are `direction:'out'` — collections/totals must exclude them (`p.direction !== 'out'`). Wallet totals must subtract refunded sales (full = full method share, partial = prorated for split) everywhere (ReportsManager + TransactionsManager together).
- **F17 — Queue Merge Rules (localDb.queueOp):** (a) a queued `delete` must survive later update/upsert (delete wins — never resurrect financial records); (b) merging MUST reset `retries: 0` + `status:'pending'` (no zombie ops that pass neither retry nor error recovery filters).
- **F18 — Realtime Conflict Guards:** sales UPDATE events must skip rows with a pending local change (`isPendingDelete`) — remote value is older than local intent. Realtime `stock_history` rows must be `mapStockHistory`-mapped (raw snake_case breaks prunes/reports).
- **F19 — Fetch Failure Never Wipes Cache:** `.catch(() => [])` on a leading merge source = local cache wipe (payments ledger). On failure, merge from the CURRENT local rows (identity no-op).
- **F20 — No Silent Ops Drops:** Type/constraint errors (`22P02`/`22003`/`23514`) mark ops `error` for owner review — NEVER hard-delete financial ops from the queue. Duplicate-key drops only for `sales` create (invoice collision RPC path); sync timeout must NOT release `_isSyncing` mid-batch (double execution).
- **F21 — Stale-Write Guard (DB-enforced, permanent):** Deleted financial rows can NEVER resurrect. `row_tombstones` + `record_row_tombstone()` (AFTER DELETE) + `guard_stale_write()` (BEFORE INSERT/UPDATE, raises `STALE_WRITE`/`P0007`) guard `sales`, `stock_history`, `variant_stock_history`, `purchase_records`, `expenses`, `payments`, `store_orders`, `sales_tabs`. Newest-wins: `UPDATE` with `updated_at` older than the stored row is rejected. `update_updated_at_column()` preserves client timestamps when newer. SyncEngine drops P0007 ops (payload by definition outdated) + refreshes from cloud. NEVER guard products/customers/suppliers (variation child id reuse).
- **F22 — Variant-Restock Ledger (permanent):** Variant stock changes ALWAYS flow through `variant_stock_history` (trigger updates `products.variant_data[].stock`) — never via `variant_data` in product payloads (stripped = silently lost). Stock-in targets a variant via `purchase_records.variant_id`/`variant_label` (`purchaseRecordsService.create` writes ONE 'purchase' entry; `delete` reverses ONE 'adjustment' entry). ALL stock-in MUST use the shared `commitStockInToInventory` from `src/lib/stockInCommit.ts` — parallel stock-in implementations BANNED. Shared helper: `applyVariantStockMovement()` in services.ts.
- **F23 — Guide + Guard-Pattern Registration (permanent):** 📖 [docs/SYSTEM_FUNCTIONS_GUIDE.md](docs/SYSTEM_FUNCTIONS_GUIDE.md) is the live source of truth for ALL DB functions/triggers/flows — read it before touching SQL/sync/financial logic and UPDATE it in the SAME change as any schema/flow change. Every NEW financial table/function MUST follow the guard pattern (3 triggers per table: `guard_stale_write_*`, `record_row_tombstone_*`, `update_*_updated_at` + append-only ledger triggers + shared-helper service layer), register in the guide's §2 registry + GEMINI.md SCHEMA CHANGE LOG, and pass the §7 TEST BATTERY on ALL 4 projects (expected: `f21_guards=24`, `tombstones=1`, `functions=7`) — no PASS = no "done". NEVER add a financial write path without its guards.

---

## 🎯 Universal Branding Rule (No Brand Hardcoded)

Code is UNIVERSAL and reusable across ALL clones (open source, no vendor brand anywhere):

| Where | Name | Logo |
|-------|------|------|
| Everywhere (POS, admin, store) | Settings `storeName` (fallback: `"POS"` / `"My Store"`) | Settings `storeLogo` (fallback: `/zaynahs-logo.svg` — default asset, never deleted) |

- **NEVER hardcode a vendor/business name** in UI strings, titles, manifests, exports, filenames (except legacy persistence keys — see below).
- Persistence keys are NOT branding: IndexedDB names (`ZaynahsPosDB_`, `Zaynahs_Local_Backups_DB`), localStorage auth keys (`zaynahs-pos-auth`) and the logo asset filename are legacy-compat and MUST be preserved — renaming wipes user data / logs users out.
- New features must read the tenant name from settings with neutral fallbacks.
- Files enforcing this: `src/lib/dynamicManifest.ts`, `src/App.tsx`, `index.html` inline script
- `short_name` = first 12 chars of name (with ellipsis if truncated)
- The original SVG logo at `/zaynahs-logo.svg` is the permanent default and must never be deleted

---

## 🗄️ Database Migration Rules

Whenever ANY change to database structure:

1. **Create Incremental Migration**: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. **Update Master Schema**: `supabase/schema/SUPER_MASTER_SCHEMA.sql`
   > ⚠️ **STRICT RULE:** Every new column MUST be added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the post-launch ALTER TABLE block. Adding only to `CREATE TABLE` is NOT enough — existing DBs skip CREATE TABLE and never get the column.
3. **Run SQL via Management API**:
   ```bash
   SQL=$(cat supabase/migrations/20260519120000_description.sql)
   SQL_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")
   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d "$SQL_JSON"
   ```
4. **Sync Local DB**: Update `src/lib/localDb.ts`
5. **Update setup.md**: Sync `docs/setup.md` with the change (add column to post-launch table, update checklist, etc.)
6. **Log & Document**: Add comment at top of migration file + entry in GEMINI.md Schema Change Log

---

## 🔑 Credentials Update

When user says "credentials update karo" or provides new Supabase details, update:

| File | What to Update |
|------|---------------|
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MGMT_API_KEY` |
| `.env` (root) | Same as `.env.local` |

To get keys for a new project via Management API:
```bash
curl -s "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY"
```

After update: run `npm run build`, clear browser IndexedDB.

---

## 🚀 Database Push Workflow

1. Ensure `SUPABASE_MGMT_API_KEY` is set in `.env.local`
2. Execute FULL master schema (idempotent — safe to run any time):
   ```bash
   SCHEMA_SQL=$(cat supabase/schema/SUPER_MASTER_SCHEMA.sql)
   SCHEMA_JSON=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SCHEMA_SQL")
   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_MGMT_API_KEY" \
     -H "Content-Type: application/json" \
     -d "$SCHEMA_JSON"
   ```
3. Verify dashboard loads correctly

---

## ⚙️ Settings Sync Strategy

- **Local-First Handshake**: Load remote only if cloud `updatedAt` is 5+ minutes newer than local
- **Strict Snake-Case Mapping**: `mapSettings` always prioritizes Supabase snake_case. Never use spread operator
- **Instant Persistence**: Every setting syncs immediately on change via `handleInstantUpdate`
- **Singleton ID**: Always use `00000000-0000-4000-8000-000000000001`. **Strict Rule:** NEVER fetch settings using a generic `select('*')` without appending `.eq('id', SETTINGS_ID)`. Database bugs can sometimes create garbage rows, and a generic query will fetch a random row, causing a global settings reset bug on refresh.
- **Type Safety**: Font Weight always String. Sliders use correct type.

---

## ⏱️ Retention & Auto-Cleanup Policies

To prevent database bloat and keep local IndexedDB caches fast and lightweight, automatic data retention policies are implemented at startup inside the sync engine:

1. **24-Hour Expiry for Cancelled Orders**:
   - Helper function `pruneExpiredCancelledOrders()` is triggered inside `startSyncEngine()` on startup and runs every hour in the background.
   - Cleans both the offline cache (**Dexie IndexedDB**) and the remote server (**Supabase**) by removing orders with `status = 'cancelled'` whose last modified timestamp is older than 24 hours.
   - Ensures local sync is decoupled and stays clean without database administrator manual tasks.

2. **90-Day Expiry for Stock History**:
   - Helper function `pruneOldStockHistory()` removes `stock_history` records older than 90 days.
   - Caps total local stock history records at 5000 items to preserve mobile device performance.

---

## 📁 File Creation Rule

- Check `App.tsx` routing first
- Follow existing component structure
- Auto-register in router if it's a page
- Never create dead/unused files

---

## 📝 Task Management Rule

For every large or multi-step task, create a `todo.md` file in the project root to plan and track progress.

---

## 🌳 Link Tree & Documentation Rule

Whenever a task is completed:
1. Document the exact files created/modified in a "Link Tree" format at the end of your response.
2. If ANY database schema (SQL, localDb) or data types (`types/index.ts`) were changed, add a log entry to the **SCHEMA CHANGE LOG** in `GEMINI.md`.
3. If a new setting/column was added, verify `docs/setup.md` and `supabase/schema/SUPER_MASTER_SCHEMA.sql` reflect the current state.

---

## 🚨 Error Handling Protocol

When user pastes any error:
1. Identify type from Troubleshooting Cheatsheet in GEMINI.md
2. Read ONLY the relevant file
3. Fix + migration if DB related
4. One response, complete fix, no back and forth

---

## 🧠 Project Knowledge Base

- **Global State**: `src/context/SupabaseAppContext.tsx`
- **Auth Logic**: `src/context/SupabaseAppContext.tsx`
- **Local DB**: `src/lib/localDb.ts`
- **Sync Engine**: `src/lib/syncEngine.ts`
- **API Services**: `src/lib/services.ts`
- **Master Schema**: `supabase/schema/SUPER_MASTER_SCHEMA.sql`
- **Global Dialog System**: `src/lib/dialog.tsx` & `src/components/common/DialogProvider.tsx`
- **POS Interface**: `src/components/pos/`
- **Settings**: `src/components/settings/Settings.tsx`
- **Inventory**: `src/components/inventory/`
- **Reports**: `src/components/reports/`

---

## 📚 Reference Docs

| Doc | Purpose |
|-----|---------|
| [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) | Supabase Management API — all DB ops via `sbp_` token |
| [@docs/cloudflare-pages-api-guide.md](docs/cloudflare-pages-api-guide.md) | Cloudflare Pages API — project, deploy, env vars via `cfut_` token |
| [@docs/SYSTEM_FUNCTIONS_GUIDE.md](docs/SYSTEM_FUNCTIONS_GUIDE.md) | ⚙️ Live registry of ALL DB functions/triggers + financial flows (F21/F22/sync) + new-function checklist + TEST BATTERY — READ FIRST before touching SQL/sync/financial logic |
| [GEMINI.md](GEMINI.md) | Master rules, financial integrity, migration rules |
| [docs/setup.md](docs/setup.md) | Complete setup guide (fresh project + existing DB sync) — keep updated with every change |
| [docs/MODULES.md](docs/MODULES.md) | 📚 Live registry of ALL shared modules — must be updated whenever a shared module is added/changed |
| [docs/UI_RULES.md](docs/UI_RULES.md) | UI styling and design rules (must read before UI work) |

---

## 📸 Vision Model Prompt Template (Ysha)

Whenever a vision model (e.g. GPT-4o, Claude Sonnet) sends a prompt based on an image/screenshot, it MUST follow the master template. 

> 👉 **START HERE:** Open and copy the complete prompt from [@docs/prompts/CLI_PROMPT_WRITER.md](docs/prompts/CLI_PROMPT_WRITER.md) when initializing a CLI Prompt Writer agent.

## 🗣️ COMMUNICATION RULE (MANDATORY)
- **Short & To the Point:** Always keep your answers extremely short and directly to the point. No long explanations.
- **Language:** ALWAYS reply in **Roman Urdu** (e.g., "Han bhai, fix kar diya hai").
