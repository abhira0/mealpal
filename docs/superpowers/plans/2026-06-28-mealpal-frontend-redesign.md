# MealPal Frontend Redesign — "Enamel & Label Tape" (locked design)

> Implementation spec. The visual source of truth is the Design Lab screenshots in
> `/private/tmp/claude-501/-Users-abhishekr-git-repos-mealpal/038731b3-2295-4329-bd91-9b7c43dd68d7/scratchpad/lab-*.png`
> (lab-d2..d7f). Match them. This doc gives exact tokens, component APIs, and per-page structure.

**Goal:** Replace the current rough frontend with the locked, custom-built, mobile-first PWA. No native form controls.

**Locked decisions:**
- **Direction:** Enamel & Label Tape. **Palette (A1):** `--ink:#20262B; --enamel:#115E59; --enamel-dark:#0C443B; --paper:#EFEADD; --paper-raised:#FBFAF4; --paprika:#D1492C; --paprika-soft:#E07A52; --turmeric:#E0A526; --sage:#8A9A8B; --line:#d9d3c2; --line-soft:#e8e1cd; --chip-bg:#ECEEE6; --low-bg:#F5E2B8; --low-ink:#7a5a12; --run-bg:#F4D9CE; --run-ink:#9c3a1f`.
- **Type (T1):** display **Bricolage Grotesque** (800, tracking -0.02em), body **Hanken Grotesk** (400/500/600/700), data **Space Mono** (400/700) for ALL quantities/prices/labels. Scale: display 20–28px, h2 16px, body 14–16px, caption/mono-label 9–11px uppercase letter-spacing .12–.14em.
- **Components (K2 crisp hairline):** cards = `--paper-raised` bg, `1px solid --line`, radius 8px, NO shadow. Buttons = solid paprika, radius 6–8px. Chips = `QuantityChip` (below).
- **Controls (CC2 custom, NO native):** custom bottom-sheet dropdown, custom stepper, custom checkbox; inline radio list only for tiny fixed sets (e.g. unit g/ml/oz/count). Hand-build a11y: focus-visible ring (`box-shadow:0 0 0 3px rgba(17,94,89,.25)`), keyboard (arrows/enter/escape), `role`/`aria-*`, focus trap + scrim-dismiss on the sheet.
- **Nav (N2):** fixed bottom bar, 5 tabs: Today · Plan · Pantry · Shop · Manage. Active tab = paprika-soft. Safe-area inset bottom padding.
- **Pages:** Today=timeline (L1) · Plan=week strip (P2) · Pantry=flat list (PN1) · Shop=tear-off tickets + run-out urgency (SH1) · Recipe=single scroll + live serving stepper (RD1) · Recipes list / Manage / Login per lab-d7f.

**Quality floor:** responsive to 360px; visible `:focus-visible`; `prefers-reduced-motion: reduce` disables transitions/sheet animation; tap targets ≥44px; content column max ~560px centered with ≥84px bottom padding to clear nav.

**Tech:** Next.js 16 App Router, TypeScript, plain CSS (tokens in `globals.css`), `next/font/google`. No Tailwind, no new deps. Next 16 dynamic params are `Promise<{id}>`.

---

## File structure

- `src/app/globals.css` — REPLACE: tokens + base + all component classes (chip, card, btn, sheet, stepper, checkbox, ticket, trigger, nav, timeline, week-strip).
- `src/app/layout.tsx` — fonts (Bricolage_Grotesque, Hanken_Grotesk, Space_Mono → CSS vars on body), metadata + manifest + `viewport.themeColor:#115E59` + apple-web-app, render `{children}` + `<BottomNav/>`.
- `src/components/BottomNav.tsx` — client, `usePathname`, 5 tabs.
- `src/components/QuantityChip.tsx` — `{value:string; tone?:'default'|'low'|'run'|'price'}`; Space Mono on tinted ground, 4px radius, 3px left accent bar (sage default / turmeric low / paprika run / enamel price). The signature.
- `src/components/Sheet.tsx` — generic bottom-sheet (scrim, grab handle, focus trap, escape/scrim close, reduced-motion aware).
- `src/components/Dropdown.tsx` — custom select built on `Sheet`: `{label, value, options:{id,label}[], onChange}`. Trigger = hairline field with caret; opens Sheet with title + option rows + ✓ on selected.
- `src/components/Stepper.tsx` — `{value, min?, onChange}`; − / value(Space Mono) / +, hairline, 38px.
- `src/components/Checkbox.tsx` — `{checked,onChange,label?}`; 24px hairline box, paprika fill + white ✓ when on; ≥44px hit area.
- `src/components/MealCard.tsx`, `src/components/ShopTicket.tsx`, `src/components/RecipeSteps.tsx` as needed.
- Pages: `src/app/page.tsx` (Today), `src/app/plan/page.tsx`, `src/app/pantry/page.tsx`, `src/app/shop/page.tsx`, `src/app/recipes/page.tsx`, `src/app/recipes/[id]/page.tsx`, `src/app/manage/page.tsx` (+ sub-forms), `src/app/login/page.tsx`. Remove leftover `/ingredients`,`/shops`,`/products` if still present.

## globals.css (authoritative component CSS — copy these, they are the locked styles)

```css
:root{
  --ink:#20262B; --enamel:#115E59; --enamel-dark:#0C443B; --paper:#EFEADD; --paper-raised:#FBFAF4;
  --paprika:#D1492C; --paprika-soft:#E07A52; --turmeric:#E0A526; --sage:#8A9A8B;
  --line:#d9d3c2; --line-soft:#e8e1cd; --chip-bg:#ECEEE6; --low-bg:#F5E2B8; --low-ink:#7a5a12;
  --run-bg:#F4D9CE; --run-ink:#9c3a1f;
  --display:var(--font-bricolage),sans-serif; --body:var(--font-hanken),sans-serif; --mono:var(--font-space-mono),monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--body);-webkit-font-smoothing:antialiased}
.app{max-width:560px;margin:0 auto;min-height:100dvh;padding-bottom:88px}
.chrome{background:var(--enamel);color:var(--paper);padding:16px}
.chrome .eb,.eb{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--turmeric)}
.chrome h1{font-family:var(--display);font-weight:800;font-size:24px;letter-spacing:-.02em;margin-top:3px}
.slot{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--sage)}
.card{background:var(--paper-raised);border:1px solid var(--line);border-radius:8px;padding:14px}
.title{font-family:var(--display);font-weight:800;font-size:16px;letter-spacing:-.01em}
.btn{font-family:var(--body);font-weight:700;font-size:14px;background:var(--paprika);color:#fff;border:none;border-radius:8px;padding:11px 16px;min-height:44px;cursor:pointer}
.btn:focus-visible,.chip:focus-visible,.trigger:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(17,94,89,.25)}
.chip{font-family:var(--mono);font-weight:700;font-size:11px;background:var(--chip-bg);color:var(--ink);padding:4px 8px;border-radius:4px;border-left:3px solid var(--sage);white-space:nowrap;display:inline-block}
.chip.low{background:var(--low-bg);color:var(--low-ink);border-left-color:var(--turmeric)}
.chip.run{background:var(--run-bg);color:var(--run-ink);border-left-color:var(--paprika)}
.chip.price{border-left-color:var(--enamel)}
.trigger{background:var(--paper-raised);border:1px solid var(--line);border-radius:8px;padding:11px 13px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;width:100%;min-height:44px}
.scrim{position:fixed;inset:0;background:rgba(20,25,28,.32);z-index:40}
.sheet{position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;background:var(--paper-raised);border-radius:18px 18px 0 0;padding:10px 0 16px;z-index:41;box-shadow:0 -10px 30px rgba(0,0,0,.2)}
.sheet .grab{width:38px;height:4px;border-radius:3px;background:var(--line);margin:6px auto 8px}
.sheet .sh-title{font-family:var(--display);font-weight:800;font-size:15px;padding:4px 18px 8px}
.sheet .o{padding:14px 18px;font-size:15px;font-weight:600;border-top:1px solid var(--line-soft);display:flex;justify-content:space-between;min-height:44px;align-items:center}
.sheet .o[aria-selected="true"]{color:var(--enamel-dark)}
.stepper{display:inline-flex;align-items:center}
.stepper button{width:38px;height:38px;border:1px solid var(--line);background:var(--paper-raised);color:var(--enamel);font-size:18px;font-weight:700}
.stepper button:first-child{border-radius:8px 0 0 8px}.stepper button:last-child{border-radius:0 8px 8px 0}
.stepper .val{font-family:var(--mono);font-weight:700;font-size:14px;min-width:56px;text-align:center;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:9px 0;background:#fff}
.checkbox{width:24px;height:24px;border:1.6px solid var(--line);border-radius:6px;background:#fff;position:relative;flex:none}
.checkbox[aria-checked="true"]{background:var(--paprika);border-color:var(--paprika)}
.checkbox[aria-checked="true"]::after{content:"✓";color:#fff;font-size:15px;position:absolute;inset:0;display:grid;place-items:center}
.ticket{background:#F8F4E8;border-radius:4px;padding:14px;box-shadow:0 2px 0 #e1dac4;border-top:2px dashed var(--enamel)}
.nav{position:fixed;bottom:0;left:0;right:0;max-width:560px;margin:0 auto;background:var(--enamel);display:flex;justify-content:space-around;padding:8px 4px calc(10px + env(safe-area-inset-bottom));z-index:30}
.nav a{font-family:var(--mono);font-size:8px;letter-spacing:.04em;color:var(--paper);opacity:.72;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;min-width:44px;text-align:center}
.nav a.on{color:var(--paprika-soft);opacity:1;font-weight:700}
.timeline{position:relative;padding-left:18px}
.timeline::before{content:"";position:absolute;left:4px;top:4px;bottom:4px;width:2px;background:#cdd6cf}
.timeline .node{position:absolute;left:0;width:10px;height:10px;border-radius:50%;background:var(--enamel);margin-top:3px}
.week{display:flex;gap:6px;overflow-x:auto}
.week .day{flex:0 0 auto;min-width:44px;text-align:center;padding:7px 6px;border-radius:8px;border:1px solid var(--line);background:var(--paper-raised)}
.week .day.on{background:var(--enamel);border-color:var(--enamel);color:var(--paper)}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
```

## Per-page structure (match the named lab screenshot)

- **Today** `page.tsx` (lab-d7a L1): chrome eyebrow "Today · {date}" + h1 greeting + avatar link to /manage. Body = `.timeline`: for each slot (ordered) a `.slot` label + node; planned meals as `.card` (title + servings `QuantityChip` + "Cook it" `.btn`); if a slot has >1 planned option, show them stacked/selectable; empty slot = quiet "+ Add a meal" link to /plan. Fetch via server (`auth()` + lib) or client fetch to `/api/events?from=today&to=today`, `/api/slots`, `/api/recipes`.
- **Plan** `plan/page.tsx` (lab-d7b P2): chrome + horizontal `.week` strip (scrollable; dot under days that have meals; selected day = `.on`). Below: that day's slots with meal cards + "+ Add a meal" → opens `Dropdown` (recipe) + `Stepper` (servings) → POST `/api/events`. Each planned card has "Cook it" → POST `/api/events/:id/cook`. Past days editable.
- **Pantry** `pantry/page.tsx` (lab-d7c PN1): flat list, each row = ingredient name + stock `QuantityChip` (tone `low` when stock < one serving via `servingSize`, else default). Inline "+ adjust" opens a small `Stepper`/input → POST `/api/stock`. Data: `/api/stock` + `/api/ingredients`.
- **Shop** `shop/page.tsx` (lab-d7d SH1): chrome "Shop · N stops · $total". One `.ticket` per shop (name + running total), lines: `Checkbox` + ingredient name + `.meta` product+price + `QuantityChip` needed + run-out urgency chip (`run`/`low`). Checking a line → small price input → POST `/api/purchases {productId,quantity:1,dollars}` → strike + remove. Data: `/api/shopping`. Run-out urgency from prediction (best-effort; omit chip if unknown).
- **Recipe detail** `recipes/[id]/page.tsx` (lab-d7e RD1): chrome "← Recipes" + title. Body single scroll: media block (YouTube embed / `<img>` / video by `kind`), `Stepper` for servings (rescales ingredient amounts live, client state), Ingredients list (name + `QuantityChip`), numbered Steps (teal `.num` markers), "Cook it · logs to today" `.btn` → needs an event; if opened standalone, POST a cooked event or call a cook endpoint (use existing `/api/events` then cook, or note as TODO if no direct recipe-cook endpoint). Data: `/api/recipes/:id`.
- **Recipes list** `recipes/page.tsx` (lab-d7f i): search field (custom input, client filter) + recipe cards (thumbnail block + title + "Serves N · last cooked / N ingredients") linking to detail + "+ New recipe" `.btn` (opens a create form — can be a simple stub form posting `/api/recipes`).
- **Manage** `manage/page.tsx` (lab-d7f ii): grouped rows — Catalog: Ingredients / Shops & branches / Products & prices (with counts) each linking to a sub-list+form; Account: email + household name, "Sign out" (server action `signOut`). Build the catalog sub-forms here (create ingredient/shop/branch/product/price) using custom controls; unit picker uses inline radio (g/ml/oz/count).
- **Login** `login/page.tsx` (lab-d7f iii): keep existing register+`signIn` logic, restyle: chrome "MealPal" + "Welcome back", custom fields, paprika "Log in", register toggle (adds household name field). Preserve the working auth flow.

## API contract (unchanged; call by URL)
`GET/POST /api/ingredients`, `PATCH /api/ingredients/:id`; `GET/POST /api/shops`; `GET/POST /api/branches?shopId=`; `GET/POST /api/products?ingredientId=`, `POST /api/products/:id/price {dollars}`; `GET /api/recipes`, `GET /api/recipes/:id`, `POST /api/recipes`; `GET/POST /api/slots`; `GET /api/events?from=&to=`, `POST /api/events`, `POST /api/events/:id/cook`; `GET/POST /api/stock`; `GET /api/shopping`; `POST /api/purchases {productId,quantity,dollars}`. All scoped to the session household.
```
