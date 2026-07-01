# 🎨 Zaynahs POS — STRICT UI/UX DESIGN SYSTEM RULES

**NEVER write inline hardcoded colors. NEVER create a new modal from scratch. NEVER create ad-hoc button Tailwind strings. ALWAYS use the components/classes defined here.**

This file is the single source of truth for UI. Before writing or editing any UI code, read this file. If a pattern here covers your case, use it — do not invent a new one.

---

## 1. COLORS

All colors are defined as CSS variables in `src/index.css` under `:root` (and `.dark` for dark mode). Never hardcode a hex value in any `.tsx`, `.ts`, or `.css` file.

### 1.1 Required CSS variables (must exist in `src/index.css`)

```css
:root {
  --color-primary: #10b981;       /* emerald - brand color */
  --color-primary-hover: #059669;
  --color-bg: #ffffff;            /* app background, light mode */
  --color-surface: #ffffff;       /* cards, modals, dropdowns */
  --color-text: #0f172a;
  --color-text-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-danger: #ef4444;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-overlay: rgba(15, 23, 42, 0.5);
}

.dark {
  --color-primary: #10b981;
  --color-primary-hover: #059669;
  --color-bg: #0A0A0A;
  --color-surface: #171717;
  --color-text: #ffffff;
  --color-text-muted: #9ca3af;
  --color-border: rgba(255, 255, 255, 0.1);
  --color-danger: #ef4444;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-overlay: rgba(0, 0, 0, 0.6);
}
```

### 1.2 Tailwind config mapping (must exist in `tailwind.config.js`)

CSS variables alone do NOT create Tailwind utility classes. This mapping is required or classes like `bg-app` will not work:

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        app: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'text-default': 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      }
    }
  }
}
```

### 1.3 Token reference table

| Token | CSS Variable | Tailwind Class | Usage |
|-------|--------------|-----------------|-------|
| Primary | `--color-primary` | `bg-primary`, `text-primary` | Brand color, primary buttons, active states |
| Primary Hover | `--color-primary-hover` | `hover:bg-primary-hover` | Button hover state |
| Background | `--color-bg` | `bg-app` | Page/app background |
| Surface | `--color-surface` | `bg-surface` | Modals, cards, dropdowns |
| Text | `--color-text` | `text-default` | Main text color |
| Text Muted | `--color-text-muted` | `text-muted` | Secondary/helper text |
| Border | `--color-border` | `border-default` | Dividers, card outlines |
| Danger | `--color-danger` | `bg-danger`, `text-danger` | Delete, errors, destructive actions |
| Success | `--color-success` | `bg-success`, `text-success` | Confirmations, positive states |
| Warning | `--color-warning` | `bg-warning`, `text-warning` | Alerts, caution states |
| Overlay | `--color-overlay` | (used directly in Modal component only) | Modal backdrop |

**Rule:** If a color doesn't map cleanly to one of these tokens, do not guess — flag it for manual review instead of inventing a new hardcoded value.

---

## 2. BUTTONS

Always use the `.btn` base class plus one variant class. Never write long inline Tailwind strings for buttons.

**Defined in `src/index.css` under `@layer components`:**

```css
.btn {
  @apply inline-flex items-center justify-center gap-2 rounded-xl font-bold
         transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed;
  min-height: 44px; /* touch target minimum */
}
.btn-primary  { @apply bg-primary hover:bg-primary-hover text-white; }
.btn-secondary{ @apply bg-surface border border-default text-default; }
.btn-danger   { @apply bg-danger text-white; }
.btn-ghost    { @apply bg-transparent text-default hover:bg-app; }
.btn-ghost    { @apply bg-transparent text-gray-600 hover:bg-app; }

.btn-sm { @apply px-3 py-1.5 text-xs; }
.btn-md { @apply px-4 py-2.5 text-sm; }
.btn-lg { @apply px-6 py-3.5 text-base; }
```

**"Add [Entity]" Rule:** All entity creation buttons (e.g. Add Customer, Add Product, Add Expense, Add User) MUST use the exact same classes: `btn btn-primary btn-md`. Never vary size or casing. The uppercase and letter-spacing are baked into the base `.btn` class.

**Variants:**
- `btn btn-primary` — Save, Submit, Checkout, main action
- `btn btn-secondary` — Cancel, Back, neutral action
- `btn btn-danger` — Delete, Remove, destructive action
- `btn btn-ghost` — Subtle actions, icon-only buttons

**Sizes:** `btn-sm`, `btn-md` (default), `btn-lg`

**Example:**
```tsx
// ❌ WRONG
<button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold">Save</button>

// ✅ CORRECT
<button className="btn btn-primary btn-md">Save</button>
<button className="btn btn-secondary btn-md" onClick={close}>Cancel</button>
<button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
```

---

## 3. MODALS

Always use the unified `Modal` component. Never build a custom dialog wrapper, fixed-position div, or absolute-positioned popup.

**Location:** `src/components/common/Modal.tsx`
**Export type:** Named export — `export function Modal(...)`. Import as `import { Modal } from '@/components/common/Modal';` (NOT a default export).

**Behavior:**
- **Mobile (<768px):** slides up from bottom, full width, rounded top corners only, `max-height: 92dvh`, respects `env(safe-area-inset-bottom)`, body scroll locked while open
- **Desktop (≥768px):** centered dialog, dimmed backdrop (`--color-overlay`), rounded corners, `max-height: 90vh`, scrollable body
- Escape key closes it. Backdrop click closes it. Transition under 250ms.
- Uses `bg-surface`, `text-default`, `border-default` tokens — supports dark mode automatically.
- Modals MUST render via a fixed, full-viewport overlay with z-index above all navigation. On mobile, an open modal visually covers the bottom navigation.
- **Form Layout Rule:** Multi-field forms must use `lg` or `xl` width and arrange related fields in a 2-column grid on desktop (`md:grid-cols-2`).

**Props:**
```ts
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'max' | 'full'; 
  // sm: 480px, md: 640px, lg: 800px, xl: 1000px, full: 95vw
  footer?: React.ReactNode;
  children: React.ReactNode;
}
```

**Example:**
```tsx
import { Modal } from '@/components/common/Modal';

// ❌ WRONG — do not build a custom dialog wrapper
// <div className="fixed inset-0 ..."><div className="absolute ...">...

// ✅ CORRECT
<Modal
  isOpen={isOpen}
  onClose={close}
  title="Edit Product"
  footer={
    <div className="flex justify-end gap-2">
      <button className="btn btn-secondary" onClick={close}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave}>Save</button>
    </div>
  }
>
  <div className="p-4">Content here</div>
</Modal>
```

**Note:** `DialogProvider` (confirm/alert/prompt dialogs) is a separate, intentional system for quick confirmations and is NOT replaced by `Modal`. Keep both — `Modal` is for content dialogs and forms, `DialogProvider` is for simple confirm/alert/input prompts.

---

## 4. GRIDS

Always use the `.grid-layout` utility class for product grids, inventory lists, and report cards. Never write one-off `grid-template-columns` values inline.

**Defined in `src/index.css`:**
```css
.grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  width: 100%;
}
.grid-layout-tight {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
}
.grid-layout-wide {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
```

**Example:**
```tsx
<div className="grid-layout">
  <ProductCard />
  <ProductCard />
</div>

// Denser grid (e.g. POS product tiles)
<div className="grid-layout-tight">
  <ProductTile />
</div>
```

**Rule:** No grid item may have a fixed pixel width unless it is an intentional fixed-width sidebar (e.g. POS cart panel), and even then it must be hidden or converted to full-width below the `lg` breakpoint.

---

## 5. FILTERS / DROPDOWNS

- On mobile (<768px), filter panels open inside the `Modal` component (bottom-sheet), not as inline dropdowns that can overflow the screen.
- On desktop (≥768px), filters can be inline dropdowns but must use `bg-surface`, `border-default`, and `.btn-*` classes — no custom styling.

---

## 6. ENFORCEMENT CHECKLIST

Before committing any UI code, confirm:
- [ ] No hardcoded hex/rgb/rgba colors — only tokens from Section 1
- [ ] No `<button>` without `.btn .btn-*` classes
- [ ] No modal markup outside the `Modal` component (except `DialogProvider` use cases)
- [ ] No grid without `.grid-layout` (or its `-tight` / `-wide` variants)
- [ ] Dark mode tested (colors must come from variables, not assume light mode)
- [ ] Mobile tested at <768px width — no horizontal overflow, no cropped content

*Any deviation from this file causes visual inconsistency and layout bugs, especially on mobile. Stay compliant.*

---

## 7. Z-INDEX SCALE

Always follow this global stacking order to prevent overlapping bugs:

- **Base content**: `z-index 0-10`
- **Sticky/fixed nav** (top nav, bottom nav): `z-[40]`
- **Dropdowns/tooltips**: `z-[60]`
- **Modal overlay**: `z-[100]`
- **Toast/notification**: `z-[200]`
