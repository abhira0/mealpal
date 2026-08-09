# Batch Tracker — Plan 1: Foundation (data + domain + nutrition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend for cooked batches that deplete over days and feed nutrition only when eaten — the countdown/cook-signal spine — with full unit-test coverage and no UI yet.

**Architecture:** Three new tables (`batches`, `batch_items`, `batch_eaten`). A `batches.ts` domain lib of plain functions over a `db` handle (matching the codebase). Packing a batch depletes stock once for N servings using the existing cook path; eating a serving counts down `meals_remaining` and records a `batch_eaten` row. Nutrition counts batch servings on the **eaten** basis (a batch of 4 cooked adds 0 kcal until each serving is eaten).

**Tech Stack:** SQLite + Drizzle ORM, vitest. Migrations are hand-written SQL registered in `drizzle/meta/_journal.json` (db:generate is broken per project memory; new tables are additive so `db:migrate` applies them fine).

Reference spec: `docs/superpowers/specs/2026-08-09-batch-tracker-design.md`.

---

### Task 1: Schema + migration for batch tables

**Files:**
- Modify: `src/db/schema.ts` (append new tables at end)
- Create: `drizzle/0031_batches.sql`
- Modify: `drizzle/meta/_journal.json` (append entry idx 31)
- Test: `src/lib/batches.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/batches.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";

let db: TestDb; let hid: number; let slotId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Lunch", timeOfDay: "12:00" }).returning().all()[0].id;
});

describe("batch tables", () => {
  it("can insert a batch with items and an eaten row", () => {
    const batch = db.insert(schema.batches).values({
      householdId: hid, slotId, label: "Biryani lunch", cookedDate: "2026-08-09",
      mealsTotal: 4, mealsRemaining: 4,
    }).returning().all()[0];
    expect(batch.id).toBeGreaterThan(0);
    db.insert(schema.batchItems).values({ batchId: batch.id, recipeId: null, amount: 1 }).run();
    db.insert(schema.batchEaten).values({ householdId: hid, batchId: batch.id, date: "2026-08-09" }).run();
    expect(db.select().from(schema.batchItems).all()).toHaveLength(1);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/batches.test.ts`
Expected: FAIL — `schema.batches` is undefined (and/or migration missing → no such table).

- [ ] **Step 3: Add tables to schema**

Append to `src/db/schema.ts`:

```ts
// A cooked batch portioned into meals that deplete over days. Packing depletes
// stock once (via the cook path); eating a serving counts meals_remaining down.
export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
  label: text("label").notNull(),
  cookedDate: text("cooked_date").notNull(), // YYYY-MM-DD
  mealsTotal: integer("meals_total").notNull(),
  mealsRemaining: integer("meals_remaining").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Contents of ONE serving of a batch. One-of kind, mirroring meal_events:
// recipe / product(+variant) / ingredient, plus amount in canonical units.
// (Plan 1 handles recipe + product items; raw-ingredient items are a later plan.)
export const batchItems = sqliteTable("batch_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull().references(() => batches.id),
  recipeId: integer("recipe_id").references(() => recipes.id),
  productId: integer("product_id").references(() => products.id),
  variantId: integer("variant_id").references(() => productVariants.id),
  ingredientId: integer("ingredient_id").references(() => ingredients.id),
  amount: real("amount"), // servings for a recipe item; canonical units for product/ingredient
});

// One serving of a batch eaten on a date. Drives nutrition (eaten basis).
export const batchEaten = sqliteTable("batch_eaten", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  batchId: integer("batch_id").notNull().references(() => batches.id),
  date: text("date").notNull(), // YYYY-MM-DD
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 4: Write the migration SQL**

Create `drizzle/0031_batches.sql`:

```sql
CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`slot_id` integer NOT NULL,
	`label` text NOT NULL,
	`cooked_date` text NOT NULL,
	`meals_total` integer NOT NULL,
	`meals_remaining` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`recipe_id` integer,
	`product_id` integer,
	`variant_id` integer,
	`ingredient_id` integer,
	`amount` real,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_eaten` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`)
);
```

- [ ] **Step 5: Register the migration in the journal**

In `drizzle/meta/_journal.json`, append to the `entries` array (after idx 30):

```json
    ,{
      "idx": 31,
      "version": "6",
      "when": 1786300000000,
      "tag": "0031_batches",
      "breakpoints": true
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/batches.test.ts`
Expected: PASS.

- [ ] **Step 7: Apply the migration to the dev DB**

Run: `npm run db:migrate`
Expected: applies `0031_batches` with no error (additive CREATE TABLEs).

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts drizzle/0031_batches.sql drizzle/meta/_journal.json src/lib/batches.test.ts
git commit -m "feat(batches): add batches, batch_items, batch_eaten tables"
```

---

### Task 2: packBatch — create a batch and deplete stock

**Files:**
- Create: `src/lib/batches.ts`
- Test: `src/lib/batches.test.ts` (extend)

Packing writes the batch + item rows, then depletes stock once for `mealsTotal` servings: recipe items via the existing `recordCooked`, product items via a direct `recordMovement`. `mealsRemaining` starts at `mealsTotal`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/batches.test.ts` (add imports at top):

```ts
import { createProduct } from "@/lib/products";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";
import { packBatch } from "@/lib/batches";

describe("packBatch", () => {
  it("creates a batch at full count and depletes product stock by amount x mealsTotal", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Frozen Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Kirkland Veg", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g

    const batch = packBatch(db, hid, {
      slotId, label: "Lunch box", cookedDate: "2026-08-09", mealsTotal: 4,
      items: [{ productId: prod, amount: 100 }],
    });

    expect(batch.mealsTotal).toBe(4);
    expect(batch.mealsRemaining).toBe(4);
    expect(currentStock(db, hid, veg)).toBe(600); // 1000 - 100*4
    expect(db.select().from(schema.batchItems).all()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/batches.test.ts -t packBatch`
Expected: FAIL — `packBatch` not exported.

- [ ] **Step 3: Implement packBatch**

Create `src/lib/batches.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { recordCooked } from "@/lib/consumption";
import { recordMovement } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface BatchItemInput {
  recipeId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  ingredientId?: number | null;
  amount?: number | null; // servings for a recipe item; canonical units for a product
}
export interface PackBatchInput {
  slotId: number;
  label: string;
  cookedDate: string; // YYYY-MM-DD
  mealsTotal: number;
  items: BatchItemInput[];
}

/** Create a batch and deplete stock once for `mealsTotal` servings of its items. */
export function packBatch(db: Db, householdId: number, input: PackBatchInput) {
  return db.transaction((tx) => {
    const [batch] = tx.insert(schema.batches).values({
      householdId, slotId: input.slotId, label: input.label,
      cookedDate: input.cookedDate, mealsTotal: input.mealsTotal, mealsRemaining: input.mealsTotal,
    }).returning().all();

    for (const item of input.items) {
      tx.insert(schema.batchItems).values({
        batchId: batch.id,
        recipeId: item.recipeId ?? null, productId: item.productId ?? null,
        variantId: item.variantId ?? null, ingredientId: item.ingredientId ?? null,
        amount: item.amount ?? null,
      }).run();

      if (item.recipeId != null) {
        // recipe item: deplete its ingredients for (servings-per-meal x mealsTotal)
        const servings = (item.amount ?? 1) * input.mealsTotal;
        recordCooked(tx as unknown as Db, householdId, item.recipeId, servings, null);
      } else if (item.productId != null) {
        const [p] = tx.select({ ingredientId: schema.products.ingredientId })
          .from(schema.products).where(eq(schema.products.id, item.productId)).all();
        if (p) {
          recordMovement(tx as unknown as Db, householdId, {
            ingredientId: p.ingredientId, productId: item.productId, variantId: item.variantId ?? null,
            delta: -(item.amount ?? 0) * input.mealsTotal, reason: "cooked", mealEventId: null,
          });
        }
      }
      // ponytail: raw-ingredient batch items deferred to a later plan; components
      // in practice are recipes (biryani/sabji) or products (frozen veg/chapathi).
    }
    return batch;
  });
}
```

Note: if `recordMovement`'s `MovementInput` lacks a `mealEventId` field or requires others, match its real signature (`src/lib/stock.ts:18`) — pass only the fields it declares.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/batches.test.ts -t packBatch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/batches.ts src/lib/batches.test.ts
git commit -m "feat(batches): packBatch creates a batch and depletes stock x mealsTotal"
```

---

### Task 3: Query helpers — listBatches, getBatch

**Files:**
- Modify: `src/lib/batches.ts`
- Test: `src/lib/batches.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/batches.test.ts`:

```ts
import { listBatches, getBatch } from "@/lib/batches";

describe("listBatches / getBatch", () => {
  it("lists active batches (remaining > 0) and reads one with items", () => {
    const b = packBatch(db, hid, { slotId, label: "Dinner", cookedDate: "2026-08-09", mealsTotal: 3, items: [] });
    const active = listBatches(db, hid);
    expect(active.map((x) => x.id)).toContain(b.id);
    const full = getBatch(db, hid, b.id);
    expect(full?.label).toBe("Dinner");
    expect(Array.isArray(full?.items)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/batches.test.ts -t "listBatches"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/batches.ts`:

```ts
/** Active batches (still have servings left), newest cook first. */
export function listBatches(db: Db, householdId: number) {
  return db.select().from(schema.batches)
    .where(and(eq(schema.batches.householdId, householdId)))
    .all()
    .filter((b) => b.mealsRemaining > 0)
    .sort((a, b) => b.cookedDate.localeCompare(a.cookedDate));
}

/** One batch with its item rows, or null. */
export function getBatch(db: Db, householdId: number, batchId: number) {
  const [batch] = db.select().from(schema.batches)
    .where(and(eq(schema.batches.id, batchId), eq(schema.batches.householdId, householdId))).all();
  if (!batch) return null;
  const items = db.select().from(schema.batchItems)
    .where(eq(schema.batchItems.batchId, batchId)).all();
  return { ...batch, items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/batches.test.ts -t "listBatches"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/batches.ts src/lib/batches.test.ts
git commit -m "feat(batches): listBatches + getBatch query helpers"
```

---

### Task 4: eatFromBatch / uneatFromBatch — the countdown

**Files:**
- Modify: `src/lib/batches.ts`
- Test: `src/lib/batches.test.ts` (extend)

Eating decrements `mealsRemaining` (never below 0) and inserts a `batch_eaten` row for the date. Undo deletes the most recent `batch_eaten` for that batch+date and increments remaining (capped at `mealsTotal`).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/batches.test.ts`:

```ts
import { eatFromBatch, uneatFromBatch } from "@/lib/batches";

describe("eatFromBatch / uneatFromBatch", () => {
  it("counts down on eat and back up on undo, flooring at 0", () => {
    const b = packBatch(db, hid, { slotId, label: "Lunch", cookedDate: "2026-08-09", mealsTotal: 2, items: [] });
    eatFromBatch(db, hid, b.id, "2026-08-09");
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(1);
    eatFromBatch(db, hid, b.id, "2026-08-10");
    eatFromBatch(db, hid, b.id, "2026-08-11"); // past 0
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(0);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(3);

    uneatFromBatch(db, hid, b.id, "2026-08-11");
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(1);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/batches.test.ts -t "eatFromBatch"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement eat/uneat**

Append to `src/lib/batches.ts` (add `desc` to the drizzle import):

```ts
// change the top import to: import { and, desc, eq } from "drizzle-orm";

/** Eat one serving on a date: count down (floor 0) and log a batch_eaten row. */
export function eatFromBatch(db: Db, householdId: number, batchId: number, date: string) {
  return db.transaction((tx) => {
    const [batch] = tx.select().from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.householdId, householdId))).all();
    if (!batch) throw new Error("batch not found in household");
    tx.insert(schema.batchEaten).values({ householdId, batchId, date }).run();
    tx.update(schema.batches).set({ mealsRemaining: Math.max(0, batch.mealsRemaining - 1) })
      .where(eq(schema.batches.id, batchId)).run();
  });
}

/** Undo the most recent eat for a batch+date: delete the row, count back up. */
export function uneatFromBatch(db: Db, householdId: number, batchId: number, date: string) {
  return db.transaction((tx) => {
    const [batch] = tx.select().from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.householdId, householdId))).all();
    if (!batch) return;
    const [row] = tx.select().from(schema.batchEaten)
      .where(and(eq(schema.batchEaten.batchId, batchId), eq(schema.batchEaten.householdId, householdId), eq(schema.batchEaten.date, date)))
      .orderBy(desc(schema.batchEaten.id)).all();
    if (!row) return;
    tx.delete(schema.batchEaten).where(eq(schema.batchEaten.id, row.id)).run();
    tx.update(schema.batches).set({ mealsRemaining: Math.min(batch.mealsTotal, batch.mealsRemaining + 1) })
      .where(eq(schema.batches.id, batchId)).run();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/batches.test.ts -t "eatFromBatch"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/batches.ts src/lib/batches.test.ts
git commit -m "feat(batches): eatFromBatch/uneatFromBatch countdown + eaten log"
```

---

### Task 5: batchServingNutrients — nutrition of one serving

**Files:**
- Modify: `src/lib/nutrition.ts`
- Test: `src/lib/nutrition.test.ts` (extend)

One serving's nutrition = sum of its batch items: recipe items via the recipe's ingredients (reuse `consumptionForRecipe` + the file's `preferredNutrients`), product items via `productNutrients`/`variantNutrients` × amount. Live in `nutrition.ts` to reuse its existing private helpers.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/nutrition.test.ts` (reuse its existing setup/fixtures; create a product with nutrition and a batch item):

```ts
import { batchServingNutrients } from "@/lib/nutrition";
import { packBatch } from "@/lib/batches";

describe("batchServingNutrients", () => {
  it("sums a product item's nutrition for one serving", () => {
    // assumes helper factories used elsewhere in this file; adapt to local setup
    const { db, hid, slotId, productId } = setupBatchNutritionFixture();
    const b = packBatch(db, hid, { slotId, label: "Lunch", cookedDate: "2026-08-09", mealsTotal: 4, items: [{ productId, amount: 100 }] });
    const n = batchServingNutrients(db, hid, b.id);
    expect(n.calories).toBeGreaterThan(0); // 100 units x product per-unit calories
  });
});
```

Note: `setupBatchNutritionFixture()` is illustrative — build the product with a known per-unit `calories` using the same factories the rest of `nutrition.test.ts` uses (`createProduct` with a `calories` field), purchase stock, and create a slot. Assert the exact number (e.g. per-unit 2 kcal × 100 = 200).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nutrition.test.ts -t "batchServingNutrients"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement batchServingNutrients**

Add to `src/lib/nutrition.ts` (reuse existing private helpers `zeroNutrients`, `addScaled`, `productNutrients`, `variantNutrients`, `preferredNutrients`, and `getRecipe`/`consumptionForRecipe` already imported there):

```ts
/** Nutrition of ONE serving of a batch = sum of its item lines. */
export function batchServingNutrients(db: Db, householdId: number, batchId: number): Nutrients {
  const items = db.select().from(schema.batchItems)
    .where(eq(schema.batchItems.batchId, batchId)).all();
  const out = zeroNutrients();
  for (const it of items) {
    if (it.recipeId != null) {
      const recipe = getRecipe(db, householdId, it.recipeId);
      if (!recipe) continue;
      for (const line of consumptionForRecipe(recipe, it.amount ?? 1)) {
        const pn = preferredNutrients(db, householdId, line.ingredientId);
        if (pn) addScaled(out, pn, line.amount);
      }
    } else if (it.productId != null) {
      const p = db.select().from(schema.products)
        .where(and(eq(schema.products.id, it.productId), eq(schema.products.householdId, householdId))).all()[0];
      const v = it.variantId != null
        ? db.select().from(schema.productVariants).where(eq(schema.productVariants.id, it.variantId)).all()[0]
        : undefined;
      const src = v ? variantNutrients(v) : (p ? productNutrients(p) : null);
      if (src) addScaled(out, src, it.amount ?? 0);
    }
  }
  return out;
}
```

Ensure the file imports whatever it doesn't already (`getRecipe` from `@/lib/recipes`, `consumptionForRecipe` from `@/lib/consumption`, `and`/`eq` from `drizzle-orm`). Match the file's existing `Db`/`Nutrients` types.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nutrition.test.ts -t "batchServingNutrients"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition.ts src/lib/nutrition.test.ts
git commit -m "feat(nutrition): batchServingNutrients sums one batch serving"
```

---

### Task 6: dayNutrition counts batch servings eaten that day

**Files:**
- Modify: `src/lib/nutrition.ts` (`dayNutrition`, around `:182`–`:215`)
- Test: `src/lib/nutrition.test.ts` (extend)

Each `batch_eaten` row on `date` contributes one serving's nutrition to that day's `meals` and `total` (eaten basis). Cooking the batch alone (no eaten rows) contributes 0 — the key eaten-not-cooked behavior.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/nutrition.test.ts`:

```ts
import { dayNutrition } from "@/lib/nutrition";
import { eatFromBatch } from "@/lib/batches";

describe("dayNutrition + batches", () => {
  it("adds nutrition only when a serving is eaten, not when cooked", () => {
    const { db, hid, slotId, productId } = setupBatchNutritionFixture(); // per-unit 2 kcal
    const b = packBatch(db, hid, { slotId, label: "Lunch", cookedDate: "2026-08-09", mealsTotal: 4, items: [{ productId, amount: 100 }] });
    expect(dayNutrition(db, hid, "2026-08-09").total.calories).toBe(0); // cooked, not eaten
    eatFromBatch(db, hid, b.id, "2026-08-09");
    expect(dayNutrition(db, hid, "2026-08-09").total.calories).toBe(200); // one serving eaten
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nutrition.test.ts -t "dayNutrition + batches"`
Expected: FAIL — batch servings not counted (total 0 after eat).

- [ ] **Step 3: Implement — fold batch_eaten into dayNutrition**

In `src/lib/nutrition.ts`, inside `dayNutrition`, after the quick-logged snacks loop (before the totals loop at `:206`), add:

```ts
  // Batch servings eaten this day: each contributes one serving's nutrition
  // (eaten basis — a cooked-but-uneaten batch contributes nothing).
  const batchEatenRows = db.select().from(schema.batchEaten)
    .where(and(eq(schema.batchEaten.householdId, householdId), eq(schema.batchEaten.date, date))).all();
  for (const be of batchEatenRows) {
    const [batch] = db.select().from(schema.batches)
      .where(eq(schema.batches.id, be.batchId)).all();
    const nutrients = batchServingNutrients(db, householdId, be.batchId);
    meals.push({
      eventId: -1_000_000 - be.id, // negative namespace, distinct from snacks
      recipeName: batch?.label ?? "Batch meal",
      slotName: batch ? (slots.get(batch.slotId) ?? "—") : "—",
      servings: 1,
      estimate: false, // eaten = real, counts toward total
      nutrients,
      missing: [],
    });
  }
```

`estimate: false` makes the existing totals loop (`:209`) add it to `total`. No other change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nutrition.test.ts -t "dayNutrition + batches"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (no regression in existing nutrition/plan tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutrition.ts src/lib/nutrition.test.ts
git commit -m "feat(nutrition): count batch servings eaten toward the day total"
```

---

## Self-review notes

- **Spec coverage (Plan 1 slice):** batch entity + countdown (Tasks 1–4), stock depletion at pack (Task 2), nutrition on eaten basis for batches (Tasks 5–6). Deferred to later plans: the Today agenda UI, pack/eat/template UI, API routes, the ＋-button "batch" option, cloning a past batch, cook-signal surfacing, mixed batch+stock *meal* modeling on the daily template, the global rewire of non-batch meal-event nutrition to an eaten basis, and batch stock reversal on delete.
- **No placeholders:** all steps carry real code except `setupBatchNutritionFixture()` in Tasks 5–6, which is explicitly "build with the same factories this test file already uses" — the executing agent should read `nutrition.test.ts`'s existing setup and mirror it, asserting the exact kcal number.
- **Type consistency:** `packBatch`/`getBatch`/`eatFromBatch`/`uneatFromBatch`/`listBatches`/`batchServingNutrients` names are used consistently across tasks. `recordMovement` and `recordCooked` calls must match their real signatures at `src/lib/stock.ts:18` and `src/lib/consumption.ts:182`.
