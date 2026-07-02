# Responsive desktop layout — design

**Date:** 2026-07-02
**Status:** Approved (user selected layout option A + centered modals)

## Problem

MealPal is styled exclusively for phones: a 560px column centered on the
screen with a fixed bottom nav. On a desktop browser it works but looks like
a phone simulator floating in whitespace.

## Goal

Make the site feel like a real web app on wide screens while leaving mobile
pixel-identical. Chosen direction: **sidebar + wider content** (option A of
three mocked up), with **sheets becoming centered modals** on desktop.

## Approach

One breakpoint — `@media (min-width: 900px)` — added to
`src/app/globals.css`. Below 900px nothing changes. `560px` currently
appears in exactly three rules (`.app`, `.nav`, `.sheet`); those three plus
list stacks are the whole surface.

### 1. Shell & navigation

- `.app` widens to ~1040px and gains left margin to clear the sidebar;
  the 88px bottom padding (space for the bottom bar) is removed on desktop.
- The existing `BottomNav` component is restyled by CSS into a fixed left
  sidebar: enamel background, column of icon + label rows, active state in
  paprika. No new component.
- Only markup change: a "MealPal" wordmark element in the nav, hidden on
  mobile (`display:none` under 900px).

### 2. Lists flow into two columns

On desktop, content stacks whose children are list rows/cards become
2-column grids, using `:has()` so page components need no edits, e.g.:

```css
.content .stack:has(> .row), .content .stack:has(> .account-row) { ... }
```

`.section-label` children span both columns (`grid-column: 1 / -1`).
Forms, the Today timeline, and the Plan week strip keep single-flow layout.

### 3. Sheets become centered modals

`.sheet` on desktop: `top:50%; left:50%; right:auto; bottom:auto;
transform:translate(-50%,-50%); border-radius:18px`; grab handle hidden.
Same component and code paths. `dropdown-pop` and the native `<dialog>`
confirm already position correctly at any width.

### 4. Out of scope / unchanged

- No page logic, API, or data-flow changes.
- Cook-mode overlay is already full-screen and responsive.
- No per-page desktop redesigns (that was option C, rejected for now).

## Testing

Manual: resize through the 900px breakpoint on Today, Plan, Pantry,
Recipes, Shop, Manage; open a sheet, a dropdown, and a confirm dialog at
both sizes; verify mobile layout is unchanged.

## Estimated size

~60 lines of CSS + ~3 lines in `BottomNav.tsx`.
