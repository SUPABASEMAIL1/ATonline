# 🤖 AI AGENT OPERATING RULES

> ⚡ **Supabase Management API Only** — All database operations MUST use the `sbp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` token + curl/API.
> Prisma and direct DB connections have been completely removed. See [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for complete API reference.

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

## 🧠 Agent Rules
0. **Architecture**: 1 Clone = 1 Shop. Never use workspace_id or shift_id.

1. **Think Before Acting**: Analyze, break into steps, avoid unnecessary complexity
2. **Code Quality**: Clean, readable, modular, DRY
3. **Project Awareness**: Read existing files, respect architecture, do NOT rewrite unnecessarily
4. **Minimal Scanning**: Only read files directly related to the task
5. **File Verification**: Before editing a component, verify its actual usage in `App.tsx`
6. **DATA SAFETY**: Never make changes that could corrupt financial data without explicit confirmation
7. **🎨 STRICT UI PROTOCOL**: NEVER write a single line of UI code, CSS, or Tailwind without reading [docs/UI_RULES.md](docs/UI_RULES.md) FIRST. Aesthetic consistency is non-negotiable.
8. **📏 SIZING RULE (MANDATORY)**: For all new pages and components, Modals MUST use `maxWidth="lg"` or `"xl"` (never sm or md for forms) with a 2-column grid (`md:grid-cols-2`), and ALL buttons MUST include `.btn-md` by default unless specifically overriding.
9. **📱 MOBILE MODAL RULE (MANDATORY)**: All Modals, Popups, and Drawers (including Cart) MUST be displayed in the center of the screen on mobile devices (`items-center justify-center`). NEVER use bottom sheets (`items-end` or `justify-end`) for modals.
10. **Fulfill the Request**: Modify, refactor, or create exactly what the user asks without hesitation.
11. **Design Parity**: Maintain "Expert Density" aesthetic and established design patterns.
12. **Direct Action**: Find the relevant files and implement the fix directly.
13. **Strict Database Policy (NO PRISMA)**: Direct DB connections, Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`), and Prisma ORM are completely banned. You must strictly use the Supabase Management API via HTTP/curl for all database schema and data control. Refer to [@docs/supabase-api-guide.md](docs/supabase-api-guide.md) for the exact API specifications.
14. **🖼️ CENTRALIZED MEDIA SELECTOR & COMPRESSION (MANDATORY)**: All image uploads or selection workflows (products, deals, settings, logo, etc.) MUST route strictly through the centralized `MediaLibrary` component. Direct file upload triggers are banned outside the library. This enforces automatic image compression (WebP, 20-50KB target) via `compressImage` and permits image reuse across the database.
15. **💀 SKELETON LOADING RULE (MANDATORY)**: All loading states for main layout switches, routes, or grid views (storefront, product grid, list pages) MUST use the centralized `<SkeletonLoader />` component (`src/components/common/SkeletonLoader.tsx`) to provide a premium, smooth shimmer load experience. Generic spinner loaders are strictly prohibited for primary loaders.

---

## 🔴 FINANCIAL INTEGRITY RULES

See [GEMINI.md](GEMINI.md) sections F1-F8 for complete financial rules:
- F1: Duplicate Product Prevention
- F2: Stock History Is Mandatory
- F3: Dual Batch Sync (products.stock, product_batches.qty_remaining, products.batches[])
- F4: Bill Edit Must Be Atomic
- F5: Purchase Cost Must Never Be Zero Silently
- F6: Reports Must Query DB Directly
- F7: Shift ID Is Mandatory On All Records
- F8: Stock Audit Function

---

## 🎯 Brand Isolation Rule

**Only `/store` route uses saved business name + logo from settings.** All other app routes (POS, admin, reports, inventory, etc.) MUST always use hardcoded Zaynahs defaults:

| Route | Name | Logo |
|-------|------|------|
| `/store` | Settings `storeName` | Settings `storeLogo` (if uploaded, else `/zaynahs-logo.svg`) |
| All others (POS, admin, etc.) | `"Zaynahs POS"` | `/zaynahs-logo.svg` (hardcoded) |

- Files enforcing this: `src/lib/dynamicManifest.ts`, `src/App.tsx`, `index.html` inline script
- `short_name` = first 12 chars of name (with ellipsis if truncated)
- The original SVG logo at `/zaynahs-logo.svg` (gradient Z) is the permanent default and must never be deleted

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
- **Singleton ID**: Always use `00000000-0000-4000-8000-000000000001`
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
| [GEMINI.md](GEMINI.md) | Master rules, financial integrity, migration rules |
| [docs/setup.md](docs/setup.md) | Complete setup guide (fresh project + existing DB sync) — keep updated with every change |
| [docs/UI_RULES.md](docs/UI_RULES.md) | UI styling and design rules (must read before UI work) |

---

## 📸 Vision Model Prompt Template (Ysha)

Whenever a vision model (e.g. GPT-4o, Claude Sonnet) sends a prompt based on an image/screenshot, it MUST follow this exact structured format. This template is also embedded in GEMINI.md. Copy-paste this when generating prompts:

```
# [Specific Task Title]

## Business Scope
- **Applies to:** All business types (clothing, shoes, general store, tech accessories, mobiles, laptops, grocery, pharmacy, bakery, services/salon, wholesale, rental, and any other) — no logic, wording, or layout may be dedicated to one business type only
- **Generic terms enforced:** item / product / unit / category / listing / record / variant

## Related Pages Map
| # | Route | Source (Image/Screenshot) | What It Shows |
|---|-------|---------------------------|----------------|
| 1 | `[exact route]` | Image N | [short description] |

- **Cropped/close-up images:** [list which images are crops, and which parent route/page they belong to]
- **Additional pages sharing this logic (no screenshot given):** [list any other project pages that must also be checked/updated, with exact route]

## Exact Location
- **Route:** `[full exact route path]`
- **File:** `[full exact file path]`
- **Component:** `[exact component name]`
- **Section/Zone:** `[exact named UI zone]`
- **Element:** `[exact element visible in screenshot]`

## Connected Pages & Flow
- **Entry Points:** [every page/link that navigates into this page]
- **Exit Points:** [every page/link this page navigates out to]
- **Shared Component/Data Usage:** [other pages reusing same component/table/state]

## Visual Context
### Visible in screenshot:
- **Layout:** [grid/flex structure — exact column count, card sizes, alignment]
- **Elements:** [every visible UI piece — buttons, inputs, badges, icons, labels — with position]
- **Colors:** [bg, text, border, accent — hex if legible]
- **Spacing:** [gaps, padding, overflow, clipping]
- **State:** [loading, empty, error, filled, hover, active]

### Issues Found:
- **P1 — [Critical]:** [what is broken, exact element, exact location]
- **P2 — [Secondary]:** [what else is wrong, exact element, exact location]
- **P3 — [Cosmetic]:** [minor polish needed, exact element]

## Current Broken Layout (ASCII)
```
+------------------------------------------------------+
|  ASCII wireframe matching screenshot proportions       |
+------------------------------------------------------+
```

## Target Fixed Layout (ASCII)
```
+------------------------------------------------------+
|  ASCII wireframe of exact desired final state          |
+------------------------------------------------------+
```

## Instructions
### P1 — [Critical Fix]
- [Exact element, exact change, exact expected result]
- [If layout: reference Tailwind utility; if data: describe generically — never name real tables/columns/business types]
- [List every affected page from Related Pages Map, exact route]

### P2 — [Secondary Fix]
- [Exact element, exact change]

### P3 — [Cosmetic Fix]
- [Exact element, exact change]

## Responsive Expectations
| Viewport | Layout Behavior |
|----------|----------------|
| Mobile < 768px | [exact stacking/order] |
| Tablet 768–1024px | [exact behavior] |
| Desktop > 1024px | [exact behavior] |

## Final Visual Goal
- [Exact end-state visible on screen, element by element]
- [Interaction behavior: hover, click, filter, scroll]
- [Data accuracy: what loads, syncs, updates — generic terms only]
- [Confirmation ALL routes in Related Pages Map updated consistently]
- [Confirmation fix holds true across all business types in Business Scope]
```
