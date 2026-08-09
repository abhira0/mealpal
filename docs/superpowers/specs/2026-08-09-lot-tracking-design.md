# Per-lot ingredient tracking (FEFO)

## Problem

An ingredient (e.g. paneer) is bought many times: different brands/products, and
the same product bought on different trips. Each buy has its own **expiry**,
**price**, and **remaining quantity**. Today the pantry collapses all of that:
`stockByProduct` sums quantity and `expiryByProduct` takes `min()` of expiry, so
four separate buys of paneer show as one blob. Cooking picks a product by
`priority`, never by expiry, so nothing "uses the batch that spoils first."

## Goal

- Show, per ingredient → product → **lot (individual buy)**: remaining, expiry, price.
- When consuming (cook), default to the **soonest-expiring lot first** (FEFO),
  overridable via the existing cook picker.
- Keep totals (per ingredient, per product) exactly as they are today; lots are a
  finer breakdown that sums back up.

Single-user app, no backward-compat constraints — schema changes and a one-time
data migration are acceptable.

## Approach: `purchases` becomes the universal lot table

`purchases` already models a buy (quantity, `cents`, `expiresAt`, `shopId`,
`productId`, `purchasedAt`), and `stock_movements.purchaseId` already links a
purchase's inbound restock movement back to it. The design extends that link to
**every** movement:

> **remaining-per-lot = Σ `stock_movements.delta` where `purchaseId` = that lot.**

No stored "remaining" column — always self-consistent with the ledger. Today only
inbound (`purchase`) movements set `purchaseId`; consumption leaves it null. This
design FEFO-allocates each consume across lots (oldest expiry first) and stamps
`purchaseId` on each resulting movement.

A lot is a `purchases` row. Real buys are lots; a **manual on-hand backfill is
also a lot** (a `purchases` row with `manual=true`, `cents=null`, no shop). This
gives every inbound source a lot id to attribute against, so FEFO has a single
ordered list to walk.

### Why not read-time FEFO (no schema change)?

Considered and rejected. Storing the allocation (stamping `purchaseId` on
outbound movements) makes the ledger self-consistent, makes uncook reverse for
free (delete movements by `mealEventId`), and leaves room for a future
"hand-pick this exact older batch" with **zero** new schema. The single-user
context makes the migration cheap.

## Schema changes (`src/db/schema.ts`)

1. `purchases.manual` — `integer("manual", { mode: "boolean" }).notNull().default(false)`.
   Real buy = false; manual on-hand backfill = true.
2. Index on `stock_movements.purchase_id` — per-lot sums run constantly.
3. `stock_movements.purchaseId` keeps its name (a purchase *is* a lot) and is now
   set on movements of every `reason`, not just `purchase`.

Migrations are hand-written SQL (project's `db:generate` is known-broken; see
memory `mealpal-drizzle-drift`). Apply via the sqlite3 CLI and insert the
`__drizzle_migrations` bookkeeping row, per project convention.

## `src/lib/stock.ts`

### `lotsByProduct(db, householdId): Map<number, Lot[]>`
`Lot = { purchaseId, expiresAt: string | null, remaining: number, unitPriceCents: number | null, manual: boolean }`.

- `remaining` = Σ that lot's movements' `delta`.
- Sorted by `expiresAt` ascending, **undated last** (YYYY-MM-DD sorts lexically).
- Lots with `remaining <= 0` are dropped from the returned list.
- `unitPriceCents` = `purchases.cents / (quantity * packSize)` when priced, else null.
- **Invariant** (asserted in a test): for each product, Σ lot.remaining ==
  `stockByProduct(...)` for that product.

### `allocateFEFO(db, householdId, productId, ingredientId, amount, ctx): Movement[]`
- Walk the product's lots (from `lotsByProduct`, oldest expiry first). For each,
  take `min(amount_left, lot.remaining)` and write one `-delta` movement stamped
  with that `purchaseId`.
- **Overflow** (requested amount exceeds total on-hand — the "cook anyway" path
  that lets stock go negative): the remainder lands on the last lot (soonest
  expiry) as a single extra negative, so that lot goes negative. If the product
  has no lots at all, write one unattributed negative (legacy fallback).
- `ctx` carries `reason`, `variantId`, `mealEventId` for the movements.
- Returns the movements written (so callers/uncook can reason about them; uncook
  itself still deletes by `mealEventId`).

### `adjustStock` (rewrite)
- Negative delta → `allocateFEFO` (deplete lots oldest-first).
- Positive delta **with** expiry → create a new `manual` lot (a `purchases` row
  with `manual=true`, `cents=null`) + its inbound movement.
- Positive delta **without** expiry → a single undated `manual` lot (so it still
  has a lot id; sorts last in FEFO).
- **Delete `replaceManualExpiry`** and its callers — the per-product
  single-manual-date reconciliation exists only because manual dates weren't
  lots. Now each lot owns its own date; editing a lot's expiry is a plain
  `purchases.expiresAt` update.

## `src/lib/consumption.ts`

- `inStockProductsByIngredient` — order products by **soonest lot expiry**
  (min `expiresAt` across the product's in-stock lots), falling back to
  `priority` for undated products and ties. This flips both the silent default
  (`ids[0]`) and the cook picker's top-listed choice to soonest-expiring.
- `recordCooked` and `recordCookedForEvent` — replace the single lump
  `recordMovement(-line.amount)` per line with `allocateFEFO(productId, amount)`.
  Direct-product items FEFO within that fixed product; recipe/ingredient lines
  FEFO within the resolved (chosen or default) product.
- `cookChoices` / `unstockedIngredients` — unchanged in shape; they already use
  `stockByProduct` totals, which still hold.

## `src/lib/shopping.ts`

- `recordPurchase` — unchanged (already inserts a lot + inbound movement). Real
  buys get `manual` defaulting to false.
- Manual on-hand backfill — routed through the new `adjustStock` lot path.
- `listPendingPurchases`, `learnedShelfLife` — add `AND manual = false` so manual
  backfill lots don't appear as "buys to price" or skew learned shelf life.
- `listPurchaseHistory` — may show manual lots or filter them; **decision: filter
  them out** (history is a buying record, not an inventory record).
- `updatePurchase` / `deletePurchase` — already re-sync / delete the linked
  inbound movement by `purchaseId`. Deleting a lot that has outbound movements
  stamped to it must **re-FEFO** those orphaned negatives onto sibling lots, or
  block deletion when the lot is partly consumed. **Decision: block deletion of a
  partly-consumed lot** (remaining < inbound) with a clear error; a fully-intact
  lot deletes as today.

## Pantry UI (`src/app/pantry/page.tsx`)

The ingredient sheet's product row expands to its lots:

```
Nanak Paneer
  340 g · exp 08/14 · $4.99
  200 g · exp 08/28 · $5.49
  + add on-hand
```

- Each lot: remaining, editable expiry (`purchases.expiresAt`), editable price
  (`purchases.cents`), soonest first.
- "Add on-hand" creates a `manual` lot via `adjustStock` (positive, with optional
  expiry).
- The current single qty+expiry editor per product is replaced by this list. The
  "Unattributed" pool block stays for legacy null-product stock.
- New/extended stock API endpoint(s) return `lotsByProduct` and accept per-lot
  expiry/price edits and add-lot.

## Data migration (one-time, hand-written SQL)

FEFO-backfill — preserves current stock + history, adds lot detail:

1. `ALTER TABLE purchases ADD COLUMN manual …`; create the `purchase_id` index.
2. **Stamp existing outbound movements.** For each product, walk its `cooked` /
   `eaten` / negative-`manual` movements in time order and FEFO-attribute them
   against that product's purchase lots (oldest expiry first), setting
   `purchaseId`. Movements that can't be covered by any lot stay unattributed
   (legacy).
3. **Convert manual on-hand into lots.** Existing positive `manual` movements
   with a non-null `expiresAt` (and any bare on-hand carriers) become `manual`
   `purchases` rows; stamp the originating movement's `purchaseId` to the new lot.
4. Insert the `__drizzle_migrations` bookkeeping row.

A verification query after migration: for every product, Σ movements ==
Σ movements grouped-and-summed-back-by-purchaseId (i.e. no delta lost), and per
product Σ lot remaining == `stockByProduct`.

## Testing

- `stock.test.ts`: `lotsByProduct` FEFO ordering + remaining math; the
  Σ-lots == product-total invariant; `allocateFEFO` split across multiple lots;
  overflow-to-last-lot; adjustStock negative depletes oldest first; positive with
  expiry creates a lot.
- `consumption.test.ts` (or existing): product ordering picks soonest-expiring;
  cook writes per-lot movements; uncook reverses them.
- One assertion-based check that the migration's sum-preservation holds on a
  seeded fixture.

## Deliberately out of scope

- Hand-picking a specific non-FEFO lot at cook time (ledger supports it later,
  no new schema — just a picker affordance).
- Per-lot nutrition (lots share the product's nutrition profile).
- Per-lot shop attribution beyond what `purchases.shopId` already stores.
