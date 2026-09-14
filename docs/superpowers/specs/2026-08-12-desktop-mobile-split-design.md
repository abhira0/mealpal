# Desktop / Mobile split — design spec

**Date:** 2026-08-12
**Status:** approved by user (delegated full SDLC; user away, build + test + have ready)

## Goal

Platr was built mobile-first and stretched to desktop (content capped at ~960px, cards
auto-gridded, bottom-nav flipped to a sidebar via CSS). The user wants **genuinely separate
mobile and desktop experiences** — different components/views/layouts per device, not one
layout forced onto the other. Desktop should use the wide viewport for **master-detail** and
**multi-column dashboards** instead of a single narrow column.

## Non-goals

- No redesign of the visual language (palette, type, tokens in `globals.css` stay).
- No changes to API routes, data model, or business logic.
- No new runtime dependencies.

## Environment (verified)

- Next.js **16.2.9**, React 19.2.4, App Router, Turbopack default. `middleware`→`proxy` (edge
  not supported in proxy). Async request APIs mandatory. `next lint` removed (use `eslint`).
- Device detection built-in is server-side only (`userAgent()` from `next/server`); there is
  **no** built-in viewport switch — client `matchMedia` is the mechanism for responsive.
- Dev server: `next dev -p 29999` (usually already running; `reuseExistingServer:true`).
- Tests: Vitest unit (`npm test`, ~23 specs in `src/lib/*.test.ts`), Playwright e2e
  (`npm run test:e2e`, `e2e/*.spec.ts`, login via UI as `demo@demo.com`/`demo1234`, inject
  `nextjs-portal{display:none}` to defeat the dev overlay).
- Validate: `npm run lint`, `npx next typegen && npx tsc --noEmit`, `npm run build`.

## Architecture

### 1. Device switch (viewport-based, client)

- `src/lib/useIsDesktop.ts` — `useIsDesktop(): boolean | null`. Uses
  `matchMedia("(min-width: 1024px)")`, subscribes to changes (live on resize). Returns `null`
  before mount so SSR and first client render agree (no hydration mismatch), then `true`/`false`.
- `src/components/Responsive.tsx` (`"use client"`) — `{ mobile, desktop }`. While the hook is
  `null`, render a minimal skeleton (`<div className="content" aria-busy />`). Then render the
  matching subtree. Only the active subtree mounts, so no double data-fetching.

Breakpoint **1024px**: desktop master-detail needs room for two panes; phones and portrait
tablets get mobile. The existing nav media query is bumped 900→1024 to match.

### 2. Shared data, separate presentation

Mobile and Desktop views are **fully separate presentational components**. Where a page owns
non-trivial data-fetching + mutations, that logic is lifted into a **data hook** consumed by
both views, so the two presentations can never drift on data behavior. Presentation
(JSX/layout/CSS) is not shared.

- New hooks as needed: `usePantryData`, `useShopData`, `useAgenda` (extracted from
  `TodayAgenda`). Nutrition's sub-components are already layout-agnostic (props in), so its data
  stays in the view but the sub-components (`OverviewBody`, `BreakdownBody`, etc.) are reused.

### 3. File layout

- `src/views/mobile/<Page>.tsx` and `src/views/desktop/<Page>.tsx` — per-page view components.
- Existing page bodies become the `mobile/` view (moved, not rewritten — mobile must not regress).
- `src/app/<route>/page.tsx` becomes a thin switcher rendering `<Responsive mobile desktop/>`
  (keeping any server-side `auth()`/redirect it already does).
- Desktop-only styles live in **co-located CSS Modules** (`<Page>.module.css`) — scoped, no
  edits to `globals.css` beyond the nav-breakpoint bump and a few shared desktop primitives.

### 4. Nav (deliberate exception)

The bottom-nav→sidebar CSS transform already produces a correct, good-looking sidebar on
desktop. Rebuilding it as two components is low value. **Keep the CSS-responsive nav**; only
bump its breakpoint to 1024. (Rationale: the user's problem is stretched *content*, not the nav.
Documented as an intentional shared piece.)

### 5. Shared desktop primitives (in `globals.css`, small)

- `.md-layout` — CSS grid `grid-template-columns: minmax(0, 1fr) minmax(360px, 480px)` for
  master-detail (list | detail pane), with the pane a sticky `<aside>`.
- `.md-pane` — the detail pane: bordered surface card, sticky, own scroll, empty-state text.
- `.dash-grid` — auto-fit dashboard grid for Today/Nutrition multi-column.

## Per-page desktop design

Value-ordered; each ships independently.

1. **Recipes** (master-detail). Master = `EntityList` (recipe config) + "+ New" (`RecipeSheet`).
   Detail pane = `RecipeView` for the selected id (local selection state instead of navigating
   to `/recipes/[id]`). Empty state: "Select a recipe." Reuses existing components as-is.
2. **Manage entities** (`/manage/[entity]`, master-detail). Master = `EntityList slug`. Detail
   pane = the per-entity detail component (`IngredientDetail`/`ShopDetail`/`ProductDetail`/
   `SlotDetail`) or `EntityForm`, selected in-pane. `PageHeader` inside detail components is
   suppressed in pane context (add an optional `bare` prop or wrap to hide crumbs).
3. **Pantry** (master-detail). Master = the three stock sections (Use soon / In stock / Out).
   Detail pane = the lot editor currently in the Sheet (lots, EditableValue, AddOnHand,
   StockAdjust) for the selected ingredient. Data lifted to `usePantryData`.
4. **Nutrition** (dashboard). Two-column: left = Overview (ring + macro bars + scorecards),
   right = Breakdown (trend + tables). Tabs collapse into a single scrollable dashboard on wide
   screens; Day/Week + date controls in a top bar. Reuses `OverviewBody`/`BreakdownBody`.
5. **Shop** (multi-column board). Shopping "run" tickets laid out as a responsive column board
   (each `ShopTicket` a card in a grid) instead of a vertical stack; Bill/History tabs remain.
   Data lifted to `useShopData`.
6. **Today** (dashboard). Extract `useAgenda` from `TodayAgenda` (data + mutations + the three
   sheets' handlers). Desktop layout: left = day-by-day agenda timeline; right column = "Next
   cooking" cards + "Today vs goal" macros + calorie ring. Mobile view = current `TodayAgenda`
   rendering, now backed by the hook. Highest-risk refactor; done carefully, last.
7. **Login** — trivial: desktop centers a max-480px card in the viewport (CSS only, shared).
8. **`/r/[token]`** public recipe — read-only server page; responsive CSS widening only (two
   columns: media | ingredients/steps). No separate component.

## Testing strategy

- Keep all Vitest unit tests green (no logic changes should touch them).
- New Playwright specs in `e2e/`, one per major page, each:
  - logs in, injects `nextjs-portal{display:none}`;
  - **mobile viewport (390×844):** asserts a mobile-only marker is visible and the desktop
    master-detail grid is absent;
  - **desktop viewport (1280×800):** asserts the desktop layout marker, and for master-detail
    pages, that clicking a list row fills the detail pane;
  - self-cleans any rows it creates (unique `E2E-<ts>` labels, FK-ordered delete) per the
    existing `batches.spec.ts` template.
- Each view gets a stable `data-testid` (e.g. `md-layout`, `desktop-today`, `mobile-pantry`) as
  the test marker.

## Rollout / integration

- Foundation first (hook, `Responsive`, nav breakpoint, shared primitives), verified to build.
- Then pages in the order above; each page is a self-contained change (its route + its two views
  + its module CSS + its e2e spec) so partial completion still ships working value.
- Final gate: `lint` + `typegen && tsc --noEmit` + `build` + `npm test` + `npm run test:e2e` all
  green before declaring ready.

## Risks

- **TodayAgenda extraction (1316 lines, logic+render intertwined):** highest risk of regressing
  mobile. Mitigation: extract the hook conservatively, keep mobile JSX byte-identical, test
  mobile Today first.
- **Detail components render their own `PageHeader`/breadcrumbs:** must be suppressed in pane
  context to avoid duplicate chrome.
- **Hydration:** the `null`-until-mounted skeleton avoids mismatch but adds a first-paint flash;
  acceptable because pages already show loading states during client fetch.
</content>
