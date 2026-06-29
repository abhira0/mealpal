# Nutrition / Calorie Counter — Design

Date: 2026-06-29

## Goal

Add a calorie + full-label nutrition counter to MealPal that derives "what I ate
today" from the existing meal plan (no separate food diary). Nutrition data is
sourced per-product from uploaded label photos; numeric values are filled later
by reading those photos. Daily totals use the *actual product consumed*, which
the cook flow already records.

Non-goals (YAGNI): no food diary / off-plan quick-add, no USDA fallback, no OCR
pipeline (photos are read directly when filling values), no goals/targets, no
charts or history. Just "what did today add up to."

## Data model

Nutrition lives on **products** (each brand has its own label).

### `products` — new columns

Photo (mirrors the existing `shops.iconData` / `iconMime` pattern):
- `nutritionData` blob — uploaded label photo bytes (nullable)
- `nutritionMime` text — photo mime type (nullable)

Numeric fields, **stored per canonical unit** (e.g. kcal per gram for a `g`
ingredient, per count for a `count` ingredient). All `real`, all nullable
(null = not filled yet):
- `calories`, `fatG`, `satFatG`, `transFatG`, `cholesterolMg`, `sodiumMg`,
  `carbsG`, `fiberG`, `sugarG`, `proteinG`

The "per serving on the label → per canonical unit" conversion is done **once**,
when values are filled from the photos. The photo stays as the human-readable
label; the numbers are the machine-readable normalized version, so recipe/day
totals are a trivial multiply over `stockMovements.delta` (canonical units).

A migration adds the columns; `db:migrate` is run after generating it.

## Daily totals

A day's totals = sum over `mealEvents` for the selected date. Per event:

- **Cooked** → exact. Read its `stockMovements` (`reason='cooked'`,
  `mealEventId = event.id`); for each, `|delta| × product's per-unit nutrition`.
  This uses the actual product consumed that day (recorded by `recordCooked`).
- **Planned** (not yet cooked) → estimate. Scale recipe amounts via
  `consumptionForRecipe(recipe, servings)` × the preferred in-stock product's
  per-unit nutrition. Flagged as an estimate ("≈") in the UI.

Recipe-card nutrition (recipe page) reuses the planned-estimate path.

If a consumed product has no nutrition filled yet, its contribution shows "—"
and the day view notes "N products missing nutrition" so the user knows what to
photograph.

## Cook flow changes

1. **Multi-product prompt (already supported).** `cookChoices` (the
   `GET /api/events/[id]/cook` endpoint) already returns ingredients with >1
   in-stock product. Ensure the cook UI blocks on this picker instead of
   silently defaulting to the preferred product.
2. **Block incomplete cooks (new, strict).** Cooking is blocked unless **every**
   ingredient in the recipe has stock on hand. This guarantees every cooked meal
   maps to real products, so day totals are never partial or guessed. Enforced
   server-side in the cook POST (return 4xx with the missing ingredients) and
   surfaced in the cook UI. (Future escape hatch, not built now: an "untracked"
   flag on ingredients to exempt salt-level items.)

## Page: `/nutrition`

- Date picker via native `<input type="date">`, defaults to today.
- That day's meals grouped by slot: recipe name, servings, kcal + macros, an "≈"
  marker on planned (estimated) entries.
- Day totals bar: summed calories + macros.
- Missing-nutrition note when any consumed product lacks values.

## Photo upload UI (both surfaces)

- **Per-product field** on the existing product edit screen
  (`manage/products/[id]`): upload/replace the label photo inline.
- **Bulk page** `/manage/dev/nutrition-photos`: lists every product with its
  current photo thumbnail or a "missing" marker; tap to upload/replace. Built
  for ripping through all products in one phone session.
- The bulk page is reached via a new **"Dev tools"** section on the Manage page
  (a simple list; nutrition-photos is its first entry).

## Endpoints

- `PUT /api/products/[id]/nutrition` — multipart upload/replace of the label
  photo (sets `nutritionData` / `nutritionMime`). Used from phone (both UIs).
- `GET /api/products/[id]/nutrition` — serves the photo bytes (display + for
  reading when filling values).
- `PATCH /api/products/[id]/nutrition` — sets the per-canonical-unit numeric
  fields. Called when filling values from the photos.
- `GET /api/nutrition?date=YYYY-MM-DD` — returns the day's per-meal breakdown +
  totals for the `/nutrition` page.

## Testing

- Pure nutrition summation (cooked-from-movements and planned-estimate paths)
  gets a unit test with asserted totals, including a missing-nutrition product.
- Cook-block validation gets a test: cooking is rejected when an ingredient has
  zero stock, allowed when all are stocked.
