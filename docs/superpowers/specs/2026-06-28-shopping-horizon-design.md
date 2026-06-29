# Shopping horizon with learned shelf life

## Problem

The shopping list (`/shop`) tells you to buy every planned meal to the end of
time. `api/shopping/route.ts` defaults `to = "9999-12-31"`, so a 30-day+ plan
produces a single trip with "19.6 L milk", "14 kg egg whites" — a month of
perishables bought at once. We need to buy only what we need soon, and not
over-buy things that spoil.

## Approach

Limit shopping to a **horizon** (how far ahead to buy), then **cap each
ingredient at its learned shelf life** so perishables don't get over-ordered.

Both behaviors fall out of one rule, with **no new schema** — shelf life is
learned from purchase history we already store.

### Effective window per ingredient

```
effectiveWindow(ingredient) = min(horizonDays, learnedShelfLife(ingredient) ?? horizonDays)
target = sum of planned consumption for meals dated within [today, today + effectiveWindow]
needed = target − onHand        // unchanged
```

The shelf life only ever *shortens* the window — never buys further ahead than
the horizon asked for.

### Learned shelf life

For each ingredient, pool its purchases that have an `expiresAt`, and take the
median of `(expiresAt − purchasedAt)` in days.

- **Median**, not mean — one weird entry won't skew it.
- **Pooled across all products** of the ingredient. The shopping target is
  per-ingredient, and spoilage time is a property of the food, not the pack.
- **Minimum 2 dated purchases** required to trust the value. Below that, the
  ingredient has no learned shelf life and falls back to `horizonDays`.

**Cold start:** day one, no expiry data → every ingredient falls back to the
horizon, so the list behaves exactly like a fixed-window cut. The "buy a month
of milk" bug is fixed by the horizon alone (default 14 days). As expiry dates
get entered on the bill screen, perishables sharpen on their own; non-perishables
(rice, protein powder) never get expiry dates and ride the full horizon.

**Not doing:** repurchase cadence (gap between buy dates). It's confounded by
how much you buy each trip, so it doesn't bound spoilage the way expiry does.
Layer in later only if the expiry signal proves too sparse.

## Changes

- **`src/lib/shopping.ts`** — add `learnedShelfLife(db, hid): Map<ingredientId, days>`.
  Reads purchases joined to products (for `ingredientId`), filters to rows with
  non-null `expiresAt`, computes day-diff `expiresAt − purchasedAt` per row,
  groups by ingredient, returns median where count ≥ 2.
- **`src/lib/plan.ts`** — `plannedConsumption(db, hid, from, to, shelfLife?)`
  keeps its `from`/`to` interface (so the existing test is untouched) and gains
  an **optional** `shelfLife: Map<ingredientId, days>`. When present, for each
  event line skip it if the event date is past that ingredient's per-ingredient
  cutoff: `min(to, from + shelfLife.get(id))` — i.e. shelf life can only pull the
  cutoff *earlier* than `to`, never later. Omitted = current behavior.
- **`src/app/api/shopping/route.ts`** — read `horizon` from query (integer,
  default 14, clamp 1–60). Set `from = today`, `to = today + horizon`, compute
  `learnedShelfLife`, and pass it as the new arg into `plannedConsumption`.
- **`src/app/shop/page.tsx`** — a `7 / 14 / 30` day selector in the header.
  Holds horizon in state, re-fetches `/api/shopping?horizon=N` on change.
  Default 14.

## Data flow

```
shop page (horizon=N)
  → GET /api/shopping?horizon=N
      from = today;  to = today + N
      shelfLife = learnedShelfLife(db, hid)        // from purchase history
      target = plannedConsumption(db, hid, from, to, shelfLife)
               // per event, per line: include only if date ≤ min(to, from + shelfLife[id])
      stock  = stockByIngredient(db, hid)          // unchanged
      grouped = buyRecommendation(stock, target)   // unchanged: needed = target − have
  → shop ticket renders per-shop lines
```

`buyRecommendation` and `stockByIngredient` are unchanged — only the `target`
map fed in gets smaller and shelf-life-aware.

## Testing

- `learnedShelfLife`: median over dated purchases; ignores null-expiry rows;
  returns nothing for ingredients with < 2 dated purchases; pools across products.
- `plannedConsumption`: with a horizon, excludes meals past the window; with a
  shelf-life map, an ingredient whose shelf life < horizon stops accruing past
  its window while a long-shelf-life ingredient still accrues to the horizon.
- One end-to-end check in `shopping.test.ts`: a plan with milk (short learned
  shelf life) and rice (none) over 30 days, horizon 30 → milk capped, rice full.
```

