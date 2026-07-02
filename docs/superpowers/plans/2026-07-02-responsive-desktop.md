# Responsive Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MealPal usable as a real web app on desktop (sidebar nav, wider 2-column content, centered modals) while leaving mobile pixel-identical.

**Architecture:** One `@media (min-width: 900px)` block appended to `src/app/globals.css` restyles the existing shell (`.app`, `.nav`, `.sheet`) and flows row/card lists into a 2-column grid via `:has()`. The only markup change is a wordmark `<span>` in `BottomNav` (hidden on mobile). No page logic, JS behavior, or API changes.

**Tech Stack:** Plain CSS (media query, `:has()`, grid) in `src/app/globals.css`; one-line JSX addition in `src/components/BottomNav.tsx`. Verified visually with the dev server (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-07-02-responsive-desktop-design.md`

Notes for the implementer:

- CSS is not unit-testable here; each task ends with a concrete visual check at a stated viewport width instead of an automated test. `npx tsc --noEmit` / existing vitest suite must stay green (Task 3).
- The nav (`BottomNav`) is a sibling of `.app` in `<body>` (`src/app/layout.tsx`), and it renders `null` on `/login` — which is why the desktop body padding uses `body:has(.nav)` so the login page stays centered.
- The `.sheet` element is portaled to `<body>` (`src/components/Sheet.tsx`) with no inline transform, so a CSS `transform` override is safe.

---

### Task 1: Nav wordmark + desktop shell/sidebar CSS

**Files:**
- Modify: `src/components/BottomNav.tsx:80` (inside the `<nav>`)
- Modify: `src/app/globals.css` (`.nav a` block ~line 136, and append at end)

- [ ] **Step 1: Add the wordmark to BottomNav**

In `src/components/BottomNav.tsx`, right after `<nav className="nav" aria-label="Primary">`:

```tsx
    <nav className="nav" aria-label="Primary">
      <span className="nav-brand" aria-hidden="true">
        MealPal
      </span>
```

- [ ] **Step 2: Hide the wordmark on mobile (base CSS)**

In `src/app/globals.css`, in the `/* ---------- bottom nav ---------- */` section, after the `.nav a.on` rule, add:

```css
.nav-brand{display:none}
```

- [ ] **Step 3: Append the desktop shell + sidebar block**

At the end of `src/app/globals.css` (before the `prefers-reduced-motion` rule is fine too; end of file is simplest), add:

```css
/* ---------- desktop (≥900px): sidebar + wider content ---------- */
@media (min-width:900px){
  /* body padding clears the fixed sidebar; :has(.nav) keeps /login centered */
  body:has(.nav){padding-left:200px}
  .app{max-width:840px;padding-bottom:32px}
  .content{padding:24px}
  .nav{top:0;bottom:0;left:0;right:auto;width:200px;max-width:none;margin:0;flex-direction:column;justify-content:flex-start;gap:2px;padding:18px 12px}
  .nav-brand{display:block;font-family:var(--display);font-weight:800;font-size:20px;letter-spacing:-.02em;color:var(--paper);padding:4px 12px 14px}
  .nav a{flex-direction:row;align-items:center;gap:10px;font-size:11px;letter-spacing:.06em;text-align:left;padding:10px 12px;border-radius:8px;width:100%}
  .nav a.on{background:var(--enamel-dark)}
}
```

- [ ] **Step 4: Visual check**

Run: `npm run dev` and open `http://localhost:3000`.

- At a ≥900px-wide window: nav is a left sidebar (enamel, "MealPal" wordmark on top, icon+label rows, active page highlighted with a darker pill), content sits in a centered ~840px column to the right of it, no bottom bar.
- Narrow the window below 900px: bottom nav bar returns, no wordmark, layout identical to before.
- Open `http://localhost:3000/login` at desktop width: content is centered, not shifted right.

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/app/globals.css
git commit -m "feat(ui): desktop sidebar nav and wider content shell"
```

---

### Task 2: Two-column lists + centered modal sheets on desktop

**Files:**
- Modify: `src/app/globals.css` (inside the `@media (min-width:900px)` block from Task 1)

- [ ] **Step 1: Add list-grid and sheet rules**

Inside the `@media (min-width:900px){...}` block added in Task 1, append before the closing brace:

```css
  /* row/card lists flow into two columns; every non-row child spans both */
  .content:has(> .row),.content:has(> .account-row),
  .content :is(.stack,.stack-sm):has(> .row),
  .content :is(.stack,.stack-sm):has(> .account-row){display:grid;grid-template-columns:1fr 1fr;align-items:start}
  .content:has(> .row) > :not(.row),.content:has(> .account-row) > :not(.account-row),
  .content :is(.stack,.stack-sm):has(> .row) > :not(.row),
  .content :is(.stack,.stack-sm):has(> .account-row) > :not(.account-row){grid-column:1/-1}

  /* bottom sheets become centered modal dialogs */
  .sheet{top:50%;bottom:auto;left:50%;right:auto;transform:translate(-50%,-50%);width:560px;margin:0;border-radius:18px}
  .sheet .grab{display:none}
```

(`gap` is intentionally not set on the grids — the existing `.stack`/`.stack-sm` gap values carry over so desktop spacing matches mobile.)

- [ ] **Step 2: Visual check — lists**

With `npm run dev` running, at ≥900px width:

- `/pantry`: stock rows flow into two columns; the search/filter/tab controls above them span the full width.
- `/manage`: account rows are two columns; section labels span full width.
- `/manage/products` (an `EntityList` page): entity rows are two columns.
- `/` (Today) and `/plan`: timeline and week strip unchanged (single flow).
- Below 900px: all of the above are single-column, identical to before.

- [ ] **Step 3: Visual check — sheets and dialogs**

At ≥900px width:

- `/pantry` → adjust stock (or `/shop` → add purchase): the sheet appears as a centered rounded modal, no grab handle; scrim click and Escape still close it.
- Open any dropdown (`.trigger`): popover still anchors to its trigger.
- Trigger a delete confirm (native `<dialog>`): still centered.
- Below 900px: sheet slides from the bottom with grab handle, as before.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): two-column lists and centered modal sheets on desktop"
```

---

### Task 3: Regression pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check and existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; existing suite (e.g. `src/lib/stock.test.ts`) passes.

- [ ] **Step 2: Breakpoint sweep**

At 899px and 901px widths, visit `/`, `/nutrition`, `/pantry`, `/recipes`, `/shop`, `/manage`: no horizontal scrollbars, no overlapped content, nav correct on both sides of the breakpoint.

- [ ] **Step 3: Commit any fixes**

If fixes were needed, commit them:

```bash
git add -p
git commit -m "fix(ui): desktop breakpoint adjustments"
```
