# Batch Tracker + "Today" Agenda — Design

Date: 2026-08-09
Status: approved (pending spec review)

## Problem

The user meal-preps in batches but can't track it: *when does the current batch
run out → when is the next cook day?* and *did I actually eat my ~5–6 meals
today?* The underlying goal is **discipline** (regaining weight/muscle lost over
2 years), so the feature must be near-zero-friction or it won't get used.

MyFitnessPal was considered and **dropped**: no usable public API, and MealPal
already computes calories/protein vs goal, so syncing to a clone is overhead.

## The 3-phase lifecycle (the spine)

Every meal/component moves through three phases, and each phase owns a different
dimension of the app:

| Phase | Meaning | Feeds |
|---|---|---|
| **Planned** | intend to eat it | **pantry / shopping** — projects what to *buy* |
| **Cooked** | raw stock used, food now ready (batch or same-day) | **stock ledger** — ingredients consumed, ready food exists |
| **Eaten** | actually consumed | **nutrition tracking** |

The Today agenda's per-day display is this lifecycle rendered adaptively
(planned/cooked/eaten), not three literal rows.

**Key behavior change — nutrition counts EATEN, not cooked.** Today the app
treats cooking a meal as eating it (one-shot). Batches split the two: cooking a
batch of 4 consumes 4 servings of stock (correct for the cooked/stock dimension)
but must contribute **zero** calories until each serving is eaten. So
`dayNutrition().total` must move from a cooked basis to an **eaten** basis
(batch eat-taps + stock eat-taps). Planned nutrition (the estimate) is unchanged.

For **stock-type** components (chapathi, dosa batter) the "cooked" phase is
trivial/same-day: planned → bought (in stock) → eaten. The full three-phase
split matters mainly for **batch** components.

## Core concepts

### Batch
A cooking session portioned into meals that deplete over days.
- Fields: `slot`, `label`, `cookedDate`, `mealsTotal` (N), `mealsRemaining`
  (starts at N, counts down; editable — after the first meal you often revise 4→3).
- **Contents** = the items in one serving (recipe / product / ingredient +
  amount). Packing depletes stock once for `N × contents` via the existing
  cook→stock ledger.
- When `mealsRemaining <= 1`, the batch throws a **cook** signal.

### Meal = components from two sources (confirmed)
A meal is **one or more components**, each tagged:
- **batch** — cooked ahead (lunch box; dinner's sabji). Backed by an active
  batch, counts down → **cook** signal. *(net-new)*
- **stock** — ready-made, bought (chapathi, dosa batter, frozen veg, oats/
  smoothie ingredients). Consumed per meal from product stock → **buy** signal.
  *(reuses existing stock + shopping — `stockMovements`, `runOutDates`)*

Lunch = one batch component (fully cooked). Dinner = mixed: sabji (batch) +
chapathi ×2 (stock). Eating a meal decrements **every** component and each fires
its own signal; "cook sabji" and "buy chapathi" never get confused.

### Standard day (daily template)
The fixed 6-meal rotation (smoothie, oats, lunch, dinner, toast, nuts) is defined
**once** and auto-fills every day, reusing the existing recurring `mealRules`
engine. Lunch/dinner slots are filled by whatever batch is currently active.
Editable, and one missed day never changes the template.

## Screens

### "Today" tab (the home, `/`) — replaces the current planner strip
An **agenda scroll**, mobile-first. The app already has a "Today" bottom-nav tab
(clock icon) at `/`; this becomes its content. Other tabs (Nutrition, Pantry,
Shop, Manage) unchanged.

- **Scroll model:** opens pinned at **today**; scroll **up** = past days /
  history, scroll **down** = future + cook-days. Today is always home. *(Q1a)*
- **Adaptive detail per day** *(Q2·3)* — surfaces action, not the repeated
  rotation:
  - **past** day → one-line eaten summary ("6/6 ✓") — the "did I hit it" read
  - **today** → full meal list with tap-to-eat
  - **future** day → only its **cook-day** flags; quiet days stay quiet
  - This *is* the planned/cooked/eaten information, rendered by day-type rather
    than as three literal rows.
- **Eat = one tap** *(Q3a):* tap a meal's checkbox → eaten, every component
  decremented (batches −1, stock −amount), nutrition logged toward goal. Tap
  again = undo. Long-press a batch pill to fix its count.
- **Progress:** today shows a compact `meals · kcal · protein` read vs
  `nutritionGoals`; detail stays on the Nutrition tab.
- **Light editing** *(Q6b):* the ＋ button offers **one-off meal** and **batch**;
  each row has a quick ✎. Structural edits (standard day, batch contents) live
  under the **Manage** tab.

### Packing a batch *(Q4a)*
Two entry points:
- The agenda's `🍳 cook <slot>` flag **is** the primary trigger: tap it → a pack
  sheet opens **pre-filled by cloning the last batch of that slot** (contents
  copied). Set `mealsTotal` with a stepper, hit pack → stock depletes ×N,
  countdown starts. Editing contents is only needed when the combo changes.
- The Today **＋ button** gains a **"batch"** option (alongside "one-off meal"),
  which opens the same pack sheet — blank for a brand-new combo, or pick a past
  batch to clone.

## Data / architecture

- **New tables** (scoped by `householdId`): `batches`, `batch_items` (serving
  contents, mirroring the recipe/product/ingredient item kinds).
- **Meal components:** the standard-day meals need to hold multiple components of
  mixed source. Extend the meal-template representation (`mealRules`/`mealEvents`
  already carry a single recipe/product/ingredient) to allow multiple component
  lines per meal, each tagged batch vs stock. Exact shape decided in the plan.
- **Reuse (no new math):** nutrition (`src/lib/nutrition.ts`), stock ledger +
  shopping (`src/lib/stock.ts`, `runOutDates`), cook/stock depletion + product
  selection (`src/lib/consumption.ts`, `src/lib/plan.ts`), goals
  (`nutritionGoals`), recurring rules (`src/lib/rules.ts`).
- **Pattern:** domain logic as plain functions in `src/lib/batches.ts` (vitest
  beside it); thin REST route handlers under `src/app/api/batches/**` (no server
  actions — matches the codebase). Agenda UI rebuilds `/` (currently
  `PlanEditor`).
- **Migrations:** hand-written SQL (db:generate is known-broken per project
  memory); apply table rebuilds via sqlite3 CLI + a `__drizzle_migrations` row.
- Batches are their own lifecycle — not contorted into the day-grid.

## Explicitly not building

MyFitnessPal sync/export, meal templates beyond the single daily one, per-weekday
patterns (add if weekends actually diverge), push/scheduled reminders (opening
the app is the reminder). A one-way CSV export only if a concrete need appears.

## Resolved design decisions

Direction **C** (agenda) · scroll **a** (today-pinned) · detail **3** (adaptive)
· eat **a** (one-tap) · pack **a** (cook-flag pre-filled clone) · daily meals
**a** (fixed template) · mixed batch/stock components (confirmed) · editing **b**
(light inline + Manage for structure).
