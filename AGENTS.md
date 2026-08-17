# 🤖 AGENTS.md — ZaynahsPOS Operating Manual

> **ALL RULES LIVE IN `GEMINI.md`.** Yeh file sirf batati hai *kaise* kaam karna hai. Rules yahan duplicate **NAHI** hain — GEMINI.md hi single source of truth hai (banayi bhi wahin gayi hain, padhni bhi wahin se hai).

---

## 0. MANDATORY READ ORDER (har task se pehle)

1. **`GEMINI.md`** — padho poora. Isme hain: Prime Directive, F1–F24 financial rules, SHARED MODULES UNIVERSAL RULE, FEATURE PLANS (POS Product Sort etc.), Credentials rule, Clone Guide, SCHEMA CHANGE LOG.
2. **`SYSTEM_MAP.md`** — architecture, route inventory, page-by-page spec, tab/sub-tab map, component file list.
3. Task-specific files (component/tsx/ts) — `App.tsx` routing check karo pehle.

> Kabhi bhi GEMINI.md ke rules ko override mat karo. Agar conflict lage → GEMINI.md sahi hai.

---

## 1. BUILD SEQUENCE (pura system banate waqt)

Sahi order mein build karo (dependency order):

1. **Scaffold** — Vite + React + TS + Router + Tailwind + Dexie + Supabase client
2. **Shared Library** (`src/shared/`) — pehle banao, baad mein sab isi se build hoga:
   - `ui/` (Button, Card, Modal, Badge, Select, DateRangePicker, Pagination, Skeleton, BottomSheet, ToggleSwitch, SegmentedControl, Avatar, EmptyState)
   - `modules/search-and-list/` (`SharedSearchBar`, `SharedProductList`, `useDragDropList`, `DragHandle`)
   - `MediaLibrary.tsx` + `compressImage.ts`
3. **Data layer** — `localDb.ts` (Dexie), `syncEngine.ts`, `supabase.ts`, `services.ts`, `stockInCommit.ts`
4. **Context** — `SupabaseAppContext.tsx` (useApp), `AuthContext.tsx`
5. **Layout** — `Header.tsx`, `MobileBottomNav.tsx`, `OfflineBadge.tsx`, `DialogProvider.tsx`
6. **Core pages** (sequence): Dashboard → POS → Transactions → Expenses → Inventory (+7 sub-tabs) → Customers → Suppliers → Discounts → Reports (+7 sub-tabs) → Settings (+5 sub-tabs)
7. **Estore** (if `estoreEnabled`) — `/store`, `/store/checkout`, `/store/track`, Online Orders
8. **Supabase schema** — `SUPER_MASTER_SCHEMA.sql` push via Management API (NEVER psql/Dashboard)
9. **Verify** — test battery (F21 guards, parity) on active project(s)

---

## 2. ANTI-AI-BREAKABLE RULE (reminder)

GEMINI.md ka **SHARED MODULES UNIVERSAL RULE** sab se important hai:
- Har UI element shared module se aayega. Duplicate/custom buttons, icons, popups, drag, media pickers **BANNED**.
- Naya page banane se pehle `docs/MODULES.md` registry check karo.
- Violation = code reject + shared se replace.

---

## 3. DATABASE POLICY

- **NO Prisma, NO psql, NO Dashboard.** Sirf Supabase Management API (`sbp_` token + curl).
- Har schema change: incremental migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`) + `SUPER_MASTER_SCHEMA.sql` update (CREATE + ALTER TABLE ADD COLUMN IF NOT EXISTS both).
- SCHEMA CHANGE LOG entry GEMINI.md mein add karo.

---

## 4. CREDENTIALS & ENV

- Real credentials `.env.local` / `.env.local 2` me (sample nahi).
- Never commit. Clone guide (GEMINI.md) follow karo for new project.
- Supabase project = 1 clone = 1 shop (single-tenant). `workspace_id` / `shift_id` **DO NOT EXIST**.

---

## 5. COMMUNICATION

- Hamesha **Roman Urdu** me jawab do (short + to the point).
- Pehle socho, phir direct action. Back-and-forth avoid karo — ek response me complete fix.

---

## 6. RULE SOURCE MAP

| Rule type | File |
|---|---|
| Financial integrity (F1–F24) | GEMINI.md |
| Shared module / UI parity | GEMINI.md |
| Feature plans (POS Sort etc) | GEMINI.md |
| Architecture / routes / tabs | SYSTEM_MAP.md |
| Build/battery/setup | docs/setup.md, docs/SYSTEM_FUNCTIONS_GUIDE.md |
| UI design details | docs/UI_RULES.md, docs/MODULES.md |

> **TL;DR:** GEMINI.md = rules (read + follow). SYSTEM_MAP.md = structure. AGENTS.md = yeh operating manual.
