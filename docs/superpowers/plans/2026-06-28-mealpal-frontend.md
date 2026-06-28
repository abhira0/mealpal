# MealPal Frontend (PWA) Implementation Plan — "Enamel & Label Tape"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A distinctive, installable, mobile-first PWA frontend for MealPal — Today / Plan / Pantry / Shop — built against the existing REST API.

**Architecture:** Next.js 16 App Router. Plain CSS with design tokens in `globals.css` (no Tailwind — matches the repo). Fonts via `next/font/google`. A root layout provides the app shell (bottom tab bar). Screens are client components that `fetch` the JSON API by URL (the API is owned by the engine track and couples only at runtime). A small set of reusable presentational components carries the identity — chiefly the `QuantityChip`.

**Design system — "Enamel & Label Tape":** vintage enamelware + butcher-paper tickets + label-tape. Quantities are the identity. Avoid the AI-default looks.

- **Color:** `--ink:#20262B; --enamel:#115E59; --enamel-dark:#0C443F; --paper:#EFEADD; --paper-raised:#F6F3EA; --paprika:#D1492C; --turmeric:#E0A526; --sage:#8A9A8B`. App chrome (nav, headers) = enamel teal; content surfaces = paper; primary actions = paprika; "running low" = turmeric.
- **Type:** display **Bricolage Grotesque** (700/800, restraint), body **Hanken Grotesk** (400/500/600), data **Space Mono** (400/700) for all quantities/prices. Type scale: display 28–40px, h2 20px, body 16px, caption 13px. Tighten display tracking (-0.02em).
- **Signature:** `QuantityChip` — monospace value+unit on a tinted ground with a 4px radius and a 2px left accent bar, like label-maker tape. Used for every amount and price. Second signature: Shop screen tickets with a dashed top "perforation" border.
- **Quality floor:** responsive to 360px; visible keyboard focus (`:focus-visible` outline in paprika); `prefers-reduced-motion` respected; tap targets ≥44px.

**Tech Stack:** Next.js 16, TypeScript, plain CSS, `next/font`. No new deps.

**API CONTRACT (owned by engine track; call by URL).** All require an auth session cookie; all scope to the caller's household automatically.
- `GET /api/ingredients` → `[{id,name,canonicalUnit,servingSize}]`; `POST` `{name,canonicalUnit,servingSize}`.
- `GET /api/shops` → `[{id,name}]`; `POST {name}`. `GET /api/branches?shopId=` ; `POST {shopId,name}`.
- `GET /api/products?ingredientId=` → `[{id,name,packSize,priority,available,shopId,branchId,url}]`; `POST {ingredientId,shopId,name,packSize,priority?,branchId?,url?}`. `POST /api/products/:id/price {dollars}`.
- `GET /api/recipes` → `[{id,name,baseServings}]`; `GET /api/recipes/:id` → `{id,name,baseServings,notes,ingredients:[{ingredientId,amount}],steps:[{position,text}],media:[{kind,url}]}`; `POST {name,baseServings,notes,ingredients,steps,media}`.
- `GET /api/slots` → `[{id,name,position}]`; `POST {name,position}`.
- `GET /api/events?from=&to=` → `[{id,date,slotId,recipeId,servings,status}]`; `POST {date,slotId,recipeId,servings}`; `POST /api/events/:id/cook`.
- `GET /api/stock` → `{ "<ingredientId>": <canonicalUnits> }`; `POST {ingredientId,delta}`.
- `GET /api/shopping?from=&to=` → `{ "<ShopName>": [{ingredientId,ingredientName,needed,product:{id,name}|null}] }`.
- `POST /api/purchases {productId,quantity,dollars}` → records purchase + restocks.

---

## File Structure

- `src/app/globals.css` — MODIFY/REPLACE: design tokens + base styles + component classes.
- `src/app/layout.tsx` — MODIFY: fonts, metadata, manifest link, app shell + `<BottomNav/>`.
- `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` — PWA install.
- `src/components/BottomNav.tsx`, `src/components/QuantityChip.tsx`, `src/components/MealCard.tsx`, `src/components/ShopTicket.tsx`, `src/lib/units.ts` (display formatting).
- `src/app/page.tsx` — Today (hero). `src/app/plan/page.tsx`, `src/app/pantry/page.tsx`, `src/app/shop/page.tsx`, `src/app/recipes/[id]/page.tsx` and `src/app/recipes/page.tsx`, `src/app/manage/page.tsx` (catalog entry forms).
- Replace the throwaway catalog pages (`src/app/ingredients`, `src/app/shops`, `src/app/products`) with the designed equivalents under `/manage` and `/pantry`.

---

## Task 1: Design tokens, fonts, PWA manifest, app shell

**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `public/manifest.webmanifest`, icons, `src/components/BottomNav.tsx`

- [ ] **Step 1: Write the design tokens + base CSS**

Replace `src/app/globals.css` with tokens and base styles. Define `:root` with the palette and font CSS vars (set by `next/font`), a type scale, base resets, the `.chip` (QuantityChip) styles, `.card`, `.ticket` (dashed perforation top border), `.btn` / `.btn-primary` (paprika), bottom-nav styles, `:focus-visible` outline in paprika, and a `@media (prefers-reduced-motion: reduce)` block disabling transitions. Content max-width 560px centered with bottom padding ≥ 72px to clear the nav.

- [ ] **Step 2: Wire fonts + metadata + shell in `layout.tsx`**

Use `next/font/google` for `Bricolage_Grotesque`, `Hanken_Grotesk`, `Space_Mono`, exposing them as CSS variables on `<body>`. Add `export const metadata` with `title`, `description`, `manifest: "/manifest.webmanifest"`, `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MealPal" }`, and `themeColor` via `export const viewport = { themeColor: "#115E59" }`. Render `{children}` then `<BottomNav/>`.

- [ ] **Step 3: PWA manifest + icons**

Create `public/manifest.webmanifest`:

```json
{
  "name": "MealPal",
  "short_name": "MealPal",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#EFEADD",
  "theme_color": "#115E59",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Generate simple enamel-teal icons with a paprika dot (a plate glyph) at 192, 512, and 180 (apple-touch). Use ImageMagick if available, e.g.:

```bash
command -v convert && for s in 192 512; do convert -size ${s}x${s} xc:'#115E59' -fill '#D1492C' -draw "circle $((s/2)),$((s/2)) $((s/2)),$((s/4))" public/icon-${s}.png; done; cp public/icon-512.png public/apple-touch-icon.png 2>/dev/null || true
```

If ImageMagick is unavailable, create 1x1 placeholder PNGs so the manifest resolves, and note it in the report for later replacement.

- [ ] **Step 4: BottomNav component**

Create `src/components/BottomNav.tsx` (client component, uses `usePathname`): four tabs — Today (`/`), Plan (`/plan`), Pantry (`/pantry`), Shop (`/shop`) — each an icon (inline SVG or emoji ok) + label, active tab in paprika, fixed to bottom, safe-area inset padding (`env(safe-area-inset-bottom)`).

- [ ] **Step 5: Verify build**

Run: `npm run build` → succeeds. Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit** — `git commit -m "feat(ui): design system, fonts, PWA manifest, app shell"`

---

## Task 2: Shared components — QuantityChip, units, MealCard

**Files:** `src/lib/units.ts`, `src/components/QuantityChip.tsx`, `src/components/MealCard.tsx`

- [ ] **Step 1: Units formatter** — `src/lib/units.ts`: `formatQty(amount, unit)` → e.g. `1000,'g'` → `"1 kg"` when ≥1000 g/ml else `"1000 g"`; `formatServings(n)`; reuse `centsToDollars` from `@/lib/money` for `formatPrice(cents)`.
- [ ] **Step 2: QuantityChip** — `src/components/QuantityChip.tsx`: props `{ value: string; tone?: "default"|"low"|"price" }`. Renders the value in Space Mono inside `.chip` with the tone's accent bar (default sage, low turmeric, price enamel).
- [ ] **Step 3: MealCard** — `src/components/MealCard.tsx`: props `{ title; servings; recipeId; status }`. A paper card with the recipe name in Bricolage, a servings chip, and a paprika "Cook it" affordance when status==="planned".
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): QuantityChip, units formatter, MealCard"`

---

## Task 3: Today (hero), Pantry, Recipe view

**Files:** `src/app/page.tsx`, `src/app/pantry/page.tsx`, `src/app/recipes/page.tsx`, `src/app/recipes/[id]/page.tsx`

- [ ] **Step 1: Today** — replace `src/app/page.tsx`. Server component: read session via `auth()`; if signed in, fetch today's events + slots + recipes (call the lib directly server-side OR fetch the API — prefer reading via the API routes using absolute URL with the incoming cookies, or import the read functions server-side). Render today's date as a Bricolage header, then a vertical timeline: each slot with its planned/cooked meal as a `MealCard`. Empty slot → a quiet "Add a meal" link to `/plan`. Keep a sign-out control.
- [ ] **Step 2: Pantry** — `src/app/pantry/page.tsx`: list ingredients with their current stock as `QuantityChip`s; chips flip to `tone="low"` when stock is at/below a simple threshold (e.g. < 1 serving, using `servingSize`). A small "+ adjust" inline form posts to `/api/stock`.
- [ ] **Step 3: Recipe list + detail** — `src/app/recipes/page.tsx` (cards) and `src/app/recipes/[id]/page.tsx`: detail shows steps as an ordered list (numbered markers are appropriate here — steps are a real sequence), ingredient lines with `QuantityChip`, and media: YouTube/video as embeds, photos as `<img>`.
- [ ] **Step 4: Verify + commit** — `npm run build` clean; `git commit -m "feat(ui): Today, Pantry, and recipe screens"`

---

## Task 4: Plan editor

**Files:** `src/app/plan/page.tsx` (+ a client component for editing)

- [ ] **Step 1:** Build the plan view: a date picker (`<input type="date">`), the household's slots down the side, and for each (date, slot) the planned meal options. Adding a meal = a client form posting `/api/events` (select recipe + servings). Each planned meal has a paprika "Cook it" button posting `/api/events/:id/cook`, after which it shows as cooked. Past dates are editable (the API allows it). Use `MealCard`.
- [ ] **Step 2: Verify + commit** — `npm run build` clean; `git commit -m "feat(ui): plan editor with cook action"`

---

## Task 5: Shop screen — tear-off tickets + checklist

**Files:** `src/components/ShopTicket.tsx`, `src/app/shop/page.tsx`

- [ ] **Step 1: ShopTicket** — `src/components/ShopTicket.tsx`: a `.ticket` card (dashed perforation top border) titled with the shop name; lines each showing ingredient name, a `needed` `QuantityChip`, the suggested product, and a checkbox. Checking a line opens a tiny price input and posts `/api/purchases {productId, quantity:1, dollars}` then strikes the line through and removes it on success.
- [ ] **Step 2: Shop page** — `src/app/shop/page.tsx`: client component fetching `/api/shopping`, rendering one `ShopTicket` per shop. Empty state: "Nothing to buy — plan some meals first." (an invitation, not an apology).
- [ ] **Step 3: Manage page** — `src/app/manage/page.tsx`: plain forms to create ingredients, shops, branches, products, and product prices (the cold-start data entry). Functional, on-brand, not fancy. Remove the old throwaway pages `src/app/ingredients`, `src/app/shops`, `src/app/products`.
- [ ] **Step 4: Verify + commit** — `npm run build` clean; `npx tsc --noEmit` clean; `git commit -m "feat(ui): shop tickets, checklist, manage screen"`

---

## Task 6: Design self-critique pass

- [ ] **Step 1:** Run `npm run dev`, load each screen at 390px width (iPhone) and 1024px. Check: is the QuantityChip consistent everywhere amounts appear? Is teal chrome / paper content / paprika action used consistently? Any screen that reads as a generic template — fix it. Confirm `:focus-visible` is visible and reduced-motion disables transitions. Remove one decorative thing that isn't earning its place.
- [ ] **Step 2: Commit** — `git commit -m "polish(ui): design critique pass"`

---

## Self-Review Notes

- **Spec coverage:** PWA install (manifest + apple meta + icons, Task 1); bottom-tab shell (Task 1); Today hero (Task 3); recipe steps+media (Task 3); Pantry inventory with low-stock signal (Task 3); Plan editor incl. past edits + cook (Task 4); shop-grouped interactive checklist → purchase→restock (Task 5); manage/cold-start forms (Task 5). ✓
- **Identity:** QuantityChip (signature) used for every amount/price; enamel/paper/paprika roles fixed; Bricolage/Hanken/Space Mono trio; shop tickets as second signature. Steered off the cream-serif-terracotta / dark-acid / broadsheet defaults.
- **Runtime coupling only:** every screen reaches the engine via `fetch` by URL or server-side lib reads — no build-time dependency on engine modules that may be mid-flight. Screens for not-yet-merged endpoints compile fine and light up after merge.
- **Deferred:** offline/service-worker caching (manifest gives installability now; full offline is a later enhancement), real icon artwork (placeholder glyph now), recipe create form (read + plan use existing data; rich recipe authoring UI can follow).
