# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Installable PWA (manifest + appleWebApp), used primarily mobile-first. Per platform rules, mobile web / PWA is still `web`. -->

## Users

Primary user is the owner and the household they cook for — a single, known household, not anonymous new signups. Design optimizes for a returning power user who already knows the app, not for onboarding strangers. Multi-user households and auth exist so household members share one plan/pantry.

## Product Purpose

Run a household's food operation end to end: decide what to eat, track what's on hand, cook it, and buy what's missing — without the loop falling out of sync. Success is the household eating planned meals, hitting nutrition goals, and not over- or under-buying.

## Positioning

Not a recipe book or a standalone macro tracker. MealPal's difference is that four loops are wired together against real household inventory:

- **Pantry → cook → shop loop** — real stock and lot tracking (FEFO) ties what you own to what you cook to what you still need to buy.
- **Nutrition tracking** — macro/calorie goals measured against what was actually eaten, including photo/label analysis.
- **Calendar-driven prep** — meals and prep blocks pushed to a real calendar (ICS export, timed prep events pinned to America/Phoenix).
- **Recipe capture** — pulling recipes from videos/clips into structured, cookable form.

## Operating Context

Used across the week and across surfaces: **Today** (agenda + what to cook/eat now), **Nutrition** (goals, macros, analysis), **Pantry** (stock, lots, purchases), **Shop** (generated shopping list, shops, bills), **Manage** (recipes, slots, rules, goals, entities). Prep happens in real kitchen time; lunch/dinner prep is a 6–8pm block, overnight oats at 8pm. Cook Mode is used hands-on at the counter.

## Capabilities and Constraints

- Recipes with steps, media, cook mode, and video-clip import.
- Meal slots, events, and recurring rules (with skips); ICS calendar export.
- Pantry stock movements, purchases as lots, FEFO allocation at the cook seam.
- Shopping list generation from plan vs. stock, with shops, extras, and bills.
- Nutrition goals, per-day macro/calorie rollups, photo/label analysis.
- Batch cooking (batches, items, eaten tracking).
- Stack: Next.js 16 (App Router) + React 19, SQLite via Drizzle, next-auth (edge/Node split). This Next.js has breaking changes from stock — read `node_modules/next/dist/docs/` before writing Next code.
- Data/migration constraints live in the project's auto-memory (Drizzle generate drift; hand-written SQL for schema changes; FEFO lot migration already ran).

## Brand Commitments

None fixed. The name "MealPal" and the current visual system (teal, Bricolage Grotesque / Hanken Grotesk / Space Mono) are provisional — future work may evolve or replace either.

## Evidence on Hand

- Working, seeded app: demo login `demo@demo.com` / `demo1234`, dev server on port 29999.
- Production deployment exists (asus-server) with real household data.
- No testimonials, external users, or marketing claims exist — future work must not fabricate them.

## Product Principles

1. **The loop stays in sync.** Plan, stock, cook, and shop reflect one truth; a change in one is visible in the others.
2. **Built for the returning user, not the first-time visitor.** Speed and density for someone who knows the app beat hand-holding.
3. **Real quantities, real time.** Lots, FEFO, calendar-pinned prep — the app models the physical kitchen, not an idealized one.
4. **Mobile-first, hands-in-the-kitchen.** Surfaces work one-handed at the counter and on a phone.
