# Per-lot ingredient tracking (FEFO)

## Problem

An ingredient (e.g. paneer) is bought many times — different brands/products, and
the same product bought on different trips. Each buy has its own **expiry**,
**price**, and **remaining quantity**. Today the pantry collapses all of that:
`stockByProduct` sums quantity and `expiryByProduct` takes `min()` of expiry, so
the four separate buys of Roti show as one `×28 / EXP 07/16` line. Nothing shows
which batch is used first, or lets you manage batches individually.

## Goal

- Show, per ingredient → product → **lot (individual buy)**: remaining, expiry, price.
- Consumption defaults to the **soonest-expiring lot first** (FEFO).
- Totals (per ingredient, per product) stay exactly as today; lots sum back up.

Single-user app, no backward-compat constraints — schema change + one-time data
migration are acceptable.

## Where this fits the 3-state model (batch tracker)

The other session built the batch tracker; the three states are now real:
- **planned** — `meal_events`. Projection/shopping only. **Does not deplete lots.**
- **cooked** — **`packBatch`** (`src/lib/batches.ts`) creates a batch and depletes
  raw stock **once** for `mealsTotal` servings. **This is the only depletion seam.**
- **served/eaten** — `eatFromBatch` counts `mealsRemaining` down + logs
  `batch_eaten` for nutrition. **No stock movement** (already depleted at cook).

**Lots = raw ingredients only.** Cooked batches are the other session's model and
never become lots. FEFO fires at the `cooked` seam.

## Ownership boundary

- **This spec owns:** the lot substrate (schema, `lotsByProduct`, `allocateFEFO`,
  FEFO product ordering, `adjustStock` rewrite), the FEFO wiring into the existing
  cook/pack paths, and the **pantry lot UI**.
- **Other session owns:** plan/cook/eat flows and anything that *reads* lot data
  for projection. We hand them `lotsByProduct` + `allocateFEFO` as clean seams.

## Approach: `purchases` becomes the universal lot table

`purchases` already models a buy (quantity, `cents`, `expiresAt`, `shopId`,
`productId`, `purchasedAt`), and `stock_movements.purchaseId` already links a
purchase's inbound restock movement to it. Extend that link to **every** movement:

> **remaining-per-lot = Σ `stock_movements.delta` where `purchaseId` = that lot.**

No stored "remaining" column — always consistent with the ledger. Today only
inbound (`purchase`) movements set `purchaseId`; consumption leaves it null. This
design FEFO-allocates each consume across lots (soonest expiry first) and stamps
`purchaseId` on each resulting movement.

A lot is a `purchases` row. Real buys are lots; a **manual on-hand backfill is
also a lot** (`purchases` row with `manual=true`, `cents=null`, no shop). Gives
every inbound a lot id to attribute against, so FEFO walks one ordered list.

## Schema changes (`src/db/schema.ts`)

1. `purchases.manual` — `integer("manual", { mode: "boolean" }).notNull().default(false)`.
   Real buy = false; manual on-hand = true.
2. Index on `stock_movements.purchase_id` (per-lot sums run constantly).
3. `stock_movements.purchaseId` keeps its name (a purchase *is* a lot); now set on
   movements of every `reason`, not just `purchase`.

Migrations are hand-written SQL (`db:generate` is known-broken — memory
`mealpal-drizzle-drift`). Apply via the sqlite3 CLI, then insert the
`__drizzle_migrations` bookkeeping row.

## `src/lib/stock.ts`

### `lotsByProduct(db, householdId): Map<number, Lot[]>`
`Lot = { purchaseId, expiresAt: string | null, remaining: number, pricePaidCents: number | null, manual: boolean }`.
- `remaining` = Σ that lot's movements' `delta`.
- Sorted by `expiresAt` asc, **undated last** (YYYY-MM-DD sorts lexically); tie /
  undated broken by oldest `purchasedAt` first.
- `remaining === 0` lots dropped; **negative lots kept** (real "recount me" signal).
- `pricePaidCents` = `purchases.cents` (the price paid for the buy, static). null
  for manual/unpriced lots.
- **Invariant** (test): per product, Σ lot.remaining (incl. negatives) ==
  `stockByProduct` for that product.

### `allocateFEFO(tx, householdId, ingredientId, productId, amount, ctx): Movement[]`
- Accepts a caller `tx` (packBatch runs in a transaction).
- Walk the product's lots (soonest expiry first). For each, take
  `min(amountLeft, lot.remaining)` and write one `-delta` movement stamped with
  that `purchaseId`.
- **Overflow** (amount exceeds on-hand — the cook-anyway path): remainder lands on
  the last (soonest-expiry) lot, driving it negative. Product with no lots → one
  unattributed negative (legacy fallback).
- `ctx` carries `reason` (`"cooked"`), `variantId`, `mealEventId`.
- Returns the movements written (callers/reversal can use them).

### `adjustStock` (rewrite)
- Negative delta → `allocateFEFO` (deplete soonest-first).
- Positive delta **with** expiry → new `manual` lot (`purchases` row `manual=true`,
  `cents=null`) + its inbound movement.
- Positive delta **without** expiry → single undated `manual` lot (sorts last).
- **Delete `replaceManualExpiry`** and its callers — per-product single-manual-date
  reconciliation existed only because manual dates weren't lots. Each lot now owns
  its date; editing a lot's expiry is a plain `purchases.expiresAt` update.

## `src/lib/consumption.ts`

- `inStockProductsByIngredient` — order products by **soonest lot expiry** (min
  `expiresAt` across in-stock lots), falling back to `priority` for undated / ties.
  Flips the silent default (`ids[0]`) and cook picker's top choice to
  soonest-expiring.
- `recordCooked` and `recordCookedForEvent` — replace the lump
  `recordMovement(-line.amount)` per line with `allocateFEFO(productId, amount)`.
  Direct-product items FEFO within the fixed product; recipe/ingredient lines FEFO
  within the resolved (chosen/default) product. Must accept/propagate a `tx`
  (packBatch calls `recordCooked` inside its transaction).
- `cookChoices` / `unstockedIngredients` — unchanged (use `stockByProduct` totals,
  still valid).

## `src/lib/batches.ts`

- `packBatch`'s recipe items call `recordCooked` → FEFO for free once the above
  lands.
- `packBatch`'s **product-item branch** (currently a direct lump `recordMovement`,
  `batches.ts:47`) → refactor to `allocateFEFO(tx, hh, ingredientId, productId,
  amount*mealsTotal, { reason: "cooked", variantId, mealEventId: null })`.
- **Flag (out of scope):** batch-cook movements have `mealEventId = null` and there
  is no `batchId` on `stock_movements`, so a future "unpack" can't reverse by
  lookup. `allocateFEFO` returns its movements so `packBatch` *could* associate them
  later; adding batch↔movement linkage is the other session's call.

## `src/lib/shopping.ts`

- `recordPurchase` — already inserts a lot + inbound movement; real buys get
  `manual` defaulting false.
- Manual on-hand backfill → routed through the new `adjustStock` lot path.
- `listPendingPurchases`, `learnedShelfLife` — add `AND manual = false` so backfill
  lots don't masquerade as "buys to price" or skew learned shelf life.
- `listPurchaseHistory` — filter `manual = false` (history is a buying record).
- `updatePurchase` / `deletePurchase` — keep as-is; the **pantry never hard-deletes**
  (see UI), so the block-partly-consumed concern lives only here for the bill/history
  screen undoing a mis-entered buy.

## Pantry UI (`src/app/pantry/page.tsx`) — Layout A (flat lots)

Ingredient sheet: each product row expands to its lots inline (no accordion, no
drill-in). Products ordered **soonest-expiring lot first**; the product holding the
next batch sits at the top.

```
Roti
  Franco Uncooked Phulka 18ct 1.31 lb
    18  · next · exp 07/16 · $3.49        [trash]
    10  · exp 08/02 · $3.49               [trash]
    + add on-hand
```

- **Lot row** = remaining · (next badge) · expiry · price, soonest first.
- **`next` badge** — **one per ingredient sheet**, on the single soonest-expiring
  lot across all the ingredient's products. Colored by urgency (paprika `run` ≤3d /
  expired, turmeric `low` ≤7d, plain otherwise). Shown **only when the ingredient
  has 2+ lots total**.
- **Inline edits** (tap-to-edit, like today's `EditableValue`):
  - remaining → manual adjustment stamped to that `purchaseId` (recount/spill;
    lands remaining exactly where set).
  - expiry → `purchases.expiresAt`; re-sorts + may move the `next` badge live.
  - price → `purchases.cents`. Manual lots (`cents=null`) show **no price** (no
    `$—` nag).
- **Trash button** per lot = **soft zero, never a physical delete.** Writes a manual
  adjustment bringing remaining to 0; the `purchases` row + movements stay. Row
  drops out (hidden at `remaining <= 0`). Confirm only when it discards stock
  (remaining > 0): "Remove 18 of Franco …?".
- **Negative lots** shown with paprika-toned remaining (e.g. `−3`), no `next` badge;
  editing up / a new buy clears them. Exactly-zero lots hidden.
- **`+ add on-hand`** per product → creates a `manual` lot. Form = **quantity
  (required) + expiry (optional)**, no price field.
- **Unattributed pool** (`productId = null` legacy stock) — render the block **only
  when its residual is non-zero**; keeps its current single `StockAdjust`.

### Top-level pantry list (outside the sheet)
- Structure unchanged (Use soon / In stock / Out; total qty + soonest expiry;
  soonest expiry = soonest *lot* expiry, `expiryByIngredient` still returns it).
- Add a small `N batches` hint in the meta line for ingredients with 2+ dated lots.

### API surface
- Extend **`/api/stock` GET** payload with `lotsByProduct`; one fetch still hydrates
  the pantry.
- **Writes**, keyed by `purchaseId` (the lot id):
  - expiry / price edit → reuse thin `PATCH /api/purchases/[id]` (`updatePurchase`).
  - remaining correction + trash(zero) → `POST /api/stock` with `{ purchaseId, delta }`
    (a `manual` movement stamped to the lot; zero = `delta = -remaining`).
  - add on-hand → reuse `recordPurchase` with `manual: true` (qty + optional expiry).

## Data migration (one-time, hand-written SQL) — FEFO-backfill

Preserves current stock + history, adds lot detail:
1. `ALTER TABLE purchases ADD COLUMN manual …` (default 0); create the
   `stock_movements.purchase_id` index.
2. **Stamp existing outbound movements.** Per product, walk `cooked` / `eaten` /
   negative-`manual` movements in time order; FEFO-attribute each against that
   product's purchase lots (soonest expiry first), setting `purchaseId`. Movements
   no lot can cover stay unattributed (legacy).
3. **Convert manual on-hand into lots.** Existing positive `manual` movements with a
   non-null `expiresAt` (and bare on-hand carriers) become `manual` `purchases`
   rows; stamp the originating movement's `purchaseId` to the new lot.
4. Insert the `__drizzle_migrations` bookkeeping row.
5. **Verify:** per product, Σ movements == Σ (movements grouped by purchaseId) — no
   delta lost; and Σ lot remaining == `stockByProduct`.

## Testing

- `stock.test.ts`: `lotsByProduct` FEFO ordering + remaining math; Σ-lots ==
  product-total invariant (incl. negatives); `allocateFEFO` split across lots;
  overflow-to-last-lot goes negative; `adjustStock` negative depletes soonest-first;
  positive+expiry creates a lot.
- `consumption.test.ts`: product ordering picks soonest-expiring; cook writes
  per-lot movements.
- `batches.test.ts`: `packBatch` product branch writes per-lot FEFO movements.
- One assertion-based check that migration sum-preservation holds on a fixture.

## Deliberately out of scope

- Hand-picking a specific non-FEFO lot at cook time (ledger supports it later, no
  new schema — just a picker affordance in the other session's cook UI).
- Per-lot nutrition (lots share the product's nutrition).
- Batch↔movement linkage for unpack reversal (other session).
- Unit-price ("$/100 g") comparison on lot rows — belongs on shopping side.
