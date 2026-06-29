# Recipe page redesign — design

Date: 2026-06-29
Status: approved (pending spec review)

## Goal

Redesign the recipe **detail** page (`/recipes/[id]`). The current page works but
looks dated, has a confusing all-stacked layout, and is missing two features.
Three problems to fix: visual polish, layout, missing features.

## Decisions (from brainstorming)

- **Layout:** tabbed (`Ingredients · Steps · Nutrition`) with a hero + meta block on top.
- **Visual style:** "clean paper" — soft rounded cards, mono chips on tinted background,
  using the existing design tokens. No new palette.
- **New features:** cook mode + media gallery.
- **Cook time:** add a `total_minutes` field to recipes (schema change).

## Scope

In scope — recipe **detail** page only:
- Rewrite `src/components/RecipeView.tsx`.
- New `src/components/CookMode.tsx`.
- New migration adding `recipes.total_minutes`; add column to `src/db/schema.ts`.
- Recipes API (`POST` + `PUT`) accept `totalMinutes`.
- `src/components/RecipeSheet.tsx`: add a "Total time (min)" input.
- New CSS in `src/app/globals.css` for gallery, tabs, cook overlay.

Out of scope (unchanged):
- Recipes list page (`/recipes`).
- Nutrition math (`src/lib/nutrition.ts`), cost math, edit/delete flow.
- Shopping-list / eat-log integration (explicitly not chosen).

## Components

### RecipeView (rewrite)
Single client component, same data fetching as today (`/api/recipes/:id` +
`/api/ingredients`). New structure:

1. **Hero + gallery** — render the full `media[]` array, not just `media[0]`.
   First/selected item shown large via the existing `MediaBlock` logic
   (youtube iframe / video / img); remaining items as a thumbnail strip that
   swaps the active hero on click. Local state `activeMedia` (index).
2. **Header** — title, `total_minutes` (if set) + base servings, and a **Cook**
   button that opens `CookMode`.
3. **Tabs** — local state `tab: "ingredients" | "steps" | "nutrition"`.
   - *Ingredients*: servings `Stepper` (live-scales amounts via existing `ratio`),
     per-meal cost, ingredient rows with `QuantityChip`.
   - *Steps*: numbered list (existing markup, restyled).
   - *Nutrition*: existing Label/Breakdown sub-toggle and table, unchanged logic.
4. **Notes** (if present) and **EditDeleteActions** below the tabs.

Cook button is disabled / hidden when `steps.length === 0`.

### CookMode (new)
Fullscreen overlay, props `{ steps: Step[]; title: string; onClose }`.
- One step at a time, large text, current-step index in local state.
- ← / → buttons + arrow keys + Esc to close; progress dots.
- Requests `navigator.wakeLock.request("screen")` on open, releases on close
  and re-requests on `visibilitychange` (wake locks drop when tab is hidden).
  Wrapped in a feature check — graceful no-op where unsupported.

### Schema / API
- Migration `drizzle/0023_*.sql`: `ALTER TABLE recipes ADD COLUMN total_minutes integer;`
  (hand-written — `db:generate` snapshot is drifted, per project notes). Run `db:migrate` after.
- `src/db/schema.ts`: add `totalMinutes: integer("total_minutes")` (nullable) to `recipes`.
- `src/lib/recipes.ts` `RecipeInput`: add `totalMinutes: number | null`; persist in
  `createRecipe` / `updateRecipe`. `getRecipe` already returns all recipe columns.
- `src/app/api/recipes/route.ts` (POST) + `[id]/route.ts` (PUT): read
  `Number(b.totalMinutes) || null`.
- `RecipeSheet.tsx`: add a numeric "Total time (min)" input bound to the new field.

## Styling
New classes in `globals.css`, reusing tokens (`--paper-raised`, `--line`,
`--chip-bg`, `--enamel`, `--sage`, Bricolage/Hanken/Space Mono):
- `.gallery` / `.gallery-thumb` (active = enamel border).
- `.recipe-tabs` (reuse the existing `.filter` pattern if it fits).
- `.cook-overlay` (fixed, full-viewport, paper background, large step text).

## Testing
- `recipeNutrition` test stays green (no math change).
- One small check that `createRecipe`/`updateRecipe` round-trips `totalMinutes`
  (extend `src/lib/recipes.test.ts`).
- Cook mode + gallery are UI — verify manually in the running app.

## Risks / notes
- Wake Lock is unsupported in some browsers → feature-detected, degrades to a
  normal fullscreen step view.
- Gallery assumes `media[]` may be empty → falls back to the existing empty
  `.media` placeholder.
