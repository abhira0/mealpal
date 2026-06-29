# Planner Direct Items (meal or ingredient/product) — Design

## Goal

Let a planner slot hold not just a **recipe meal** but also a **direct item**: a plain ingredient (+ amount) or a product (+ optional variant + servings). Direct items behave like meals — they show in the slot, count toward daily nutrition, and deduct pantry stock when cooked. This removes the need for fake single-ingredient recipes (e.g. the demo "Dry Fruits" recipe, which is also deleted as part of this work).

## Background / current state

- `meal_events.recipeId` is `NOT NULL`; every planned/cooked event is a recipe.
- Consumption is unified through `ConsumptionLine { ingredientId, amount }`:
  - `consumptionForRecipe(recipe, servings)` → per-ingredient lines.
  - `plannedConsumption` / `runOutDates` (shopping & run-out) iterate planned events' recipe lines.
  - `recordCooked(...)` writes negative `cooked` stock movements, attributing each ingredient to an in-stock product (user pick via `cookChoices`, else the single/preferred product).
- Nutrition (`src/lib/nutrition.ts`):
  - **cooked** recipe events → read their `cooked` stock movements × product per-unit nutrition.
  - **planned** recipe events → scale recipe, use each ingredient's *preferred available* product nutrition.
  - Quick eat-log (`consumptions`) entries are already folded in (separate feature).

## Data model

`meal_events` becomes "exactly one of three kinds". New nullable columns:

| column | type | meaning |
|---|---|---|
| `recipeId` | int, **now nullable** | recipe meal (unchanged semantics) |
| `ingredientId` | int null, FK ingredients | ingredient direct item |
| `productId` | int null, FK products | product direct item |
| `variantId` | int null, FK product_variants | optional variant of the product item |
| `amount` | real null | canonical units consumed by a direct item |

**Invariant (app-enforced in `addEvent` + the events API):** exactly one of `{recipeId, ingredientId, productId}` is non-null. `variantId` is only allowed when `productId` is set. `amount` is required for direct items, null for recipe meals.

**`servings` reuse:**
- Recipe meal: servings as today; `amount` null.
- Ingredient item: user enters a canonical `amount`; `servings` = 1 (unused).
- Product item: user enters `servings` (packets/servings); `amount` is computed and stored at insert = `servings × (variant.servingSize ?? product.servingSize ?? 1)`. Storing the resolved `amount` snapshots what was consumed (immune to later serving-size edits).

Migration (hand-written, since drizzle-kit can't run interactively here): the four new columns are simple `ALTER TABLE meal_events ADD …`. Dropping `recipe_id`'s `NOT NULL` requires the SQLite table-rebuild dance — create a new `meal_events` with nullable `recipe_id` + the four new columns, `INSERT INTO … SELECT` the existing rows, drop the old table, rename. Do the rebuild first (carrying the existing columns), then the rebuilt table already includes the new columns so no separate ADD is needed. Preserve FKs and the existing column order/types exactly except for `recipe_id` nullability.

## Unified consumption

New helper in `src/lib/consumption.ts`:

```
consumptionLinesForEvent(db, householdId, ev): { ingredientId, amount, productId?: number }[]
```
- recipe event → `consumptionForRecipe(getRecipe(...), ev.servings)` (productId undefined → preferred attribution).
- ingredient event → `[{ ingredientId: ev.ingredientId, amount: ev.amount }]`.
- product event → `[{ ingredientId: product.ingredientId, amount: ev.amount, productId: ev.productId }]` (attribute to that exact product).

`ConsumptionLine` gains an optional `productId?: number` so a direct product item attributes stock to itself instead of the preferred product.

Refactor so `plannedConsumption`, `runOutDates`, `recordCooked`, `cookChoices`, `unstockedIngredients` all call `consumptionLinesForEvent` instead of `consumptionForRecipe(getRecipe(...))` directly. Behavior for recipe events is unchanged. For direct items:
- `cookChoices`: product item → no choice (product fixed); ingredient item → choice only if >1 in-stock product (same rule).
- `unstockedIngredients`: product item with 0 stock of that product → blocked; ingredient item → same as recipe.
- `recordCooked`: when a line carries `productId`, attribute to it directly (skip allocation/preferred lookup).

`cookEvent` calls a generalized `recordCookedForEvent(db, hid, ev, allocations)` (wraps the line resolution above) rather than `recordCooked(recipeId, servings, …)`. `uncookEvent` is unchanged (it deletes movements by `mealEventId`).

## Nutrition

In `dayNutrition` and `dayIngredientTable`:

- **Recipe events:** unchanged (cooked → movements, planned → preferred product).
- **Direct events (ingredient or product):** nutrition is identical whether planned or cooked, because `amount` is fixed (no recipe scaling/estimation). Compute `source nutrients × amount`:
  - product item with `variantId` → that variant's per-unit nutrients.
  - product item without variant → the product's own per-unit nutrients.
  - ingredient item → the ingredient's *preferred available* product nutrients (same resolver recipes use).
  - source has no nutrition filled in → add to `missing`.
- Render as a normal meal line: name = recipe name / variant name / product name / ingredient name; slot = its slot.

This avoids the variant-vs-stockMovement mismatch: cooked direct items don't rely on reading `productId`-only movements for nutrition; they use the event's own product/variant.

## API

`POST /api/events` accepts a discriminated body:
- `{ date, slotId, recipeId, servings }` — recipe (existing).
- `{ date, slotId, ingredientId, amount }` — ingredient item.
- `{ date, slotId, productId, variantId?, servings }` — product item.

Validation: exactly one of recipeId/ingredientId/productId; product must belong to household; if the product **has variants**, `variantId` is required (its own nutrition is empty); `variantId` must belong to that product; `amount`/`servings` positive. `addEvent` computes & stores `amount` for product items.

`cookEvent`, `deleteEvent`, `uncookEvent` endpoints unchanged in shape (they operate by event id).

## UI

**`PlanEditor` add-to-slot sheet:** a kind toggle **Recipe · Product · Ingredient** (reuse the existing inline-radio / segmented style). Then:
- Recipe → existing recipe dropdown + servings.
- Product → product dropdown; if the chosen product has variants, a required variant dropdown; servings input. (Fetch variants via `GET /api/products/[id]/variants`.)
- Ingredient → ingredient dropdown + amount input (with canonical-unit suffix, like the pack-size field).

**`MealCard`:** render a direct item's name + amount/servings and the same cook / uncook / delete actions. The card already takes an event; extend its props/typing to carry the direct-item fields and resolve display names from the lists `PlanEditor` already fetches (recipes, products, ingredients) plus variants.

## Demo cleanup (first ask)

Delete the "Dry Fruits" recipe (id 12, household 8):
- live `mealpal.db`: delete its `meal_events`, `recipe_ingredients`, `recipe_steps`, `recipe_media`, then the `recipes` row.
- `drizzle/demo_seed.sql`: remove the same rows so a reseed doesn't bring it back.

## Edge cases

- Deleting an ingredient/product referenced by a meal_event: existing `deleteProduct` nulls stock-movement `productId`; extend FK-safety so deleting a product/ingredient used by a direct meal_event is either blocked (has events) or the event is handled. Minimal: block delete if referenced by a meal_event (mirror the purchases guard in `deleteProduct`).
- Cooked direct item then variant/serving-size edited: `amount` was snapshotted at insert, so stock/nutrition stay consistent with what was logged.
- Product item targeting an assorted product with no variant chosen: prevented at the API (variant required when the product has variants).

## Testing

- `consumption.test.ts`: `consumptionLinesForEvent` for each kind; `recordCookedForEvent` attributes a product item to its own product and an ingredient item to preferred/allocated.
- `plan.test.ts`: `plannedConsumption` / `runOutDates` include direct items.
- `nutrition.test.ts`: a planned and a cooked direct product-variant item and an ingredient item each contribute the right day total.
- API/route: validation (exactly-one-kind; variant required for assorted product).
- Existing recipe-event tests must stay green (no behavior change for recipes).

## Out of scope

- Recurring rules for direct items (rules stay recipe-only).
- Editing a direct item in place (delete + re-add is fine for v1).
- Variant selection for ingredient items (ingredients resolve to preferred product only).
