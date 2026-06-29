# Assorted-Pack Variants + Quick Eat-Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one product (an assorted snack bag) carry several nutrition profiles ("variants"), and let the user quick-log eating one packet so its nutrition counts toward the day.

**Architecture:** A `product_variants` child table holds per-packet nutrition for each assorted type (canonical unit = `count`, so "per unit" = "per packet"). A `consumptions` table is the eat-log: one row per packet eaten on a date, plus a matching `eaten` stock movement that depletes the bag. The Nutrition tab sums consumptions alongside recipe-based meals. The bag itself stays an ordinary product (purchase/price/stock unchanged).

**Tech Stack:** Next.js 16, Drizzle ORM + better-sqlite3, Vitest. Hand-numbered SQL migrations in `drizzle/` (drizzle-kit generate needs a TTY here, so migrations + journal entries are written by hand).

---

## Phase 0 — Revert the parent-child pack work (uncommitted, never shipped)

These changes from the earlier (abandoned) approach must be undone first so the codebase is clean.

### Task 0: Remove the `pack_parent_id` model and all its wiring

**Files:**
- Modify: `src/db/schema.ts` — remove the `packParentId` column block from `products`.
- Delete: `drizzle/0022_product_pack_parent.sql`
- Modify: `drizzle/meta/_journal.json` — remove the `0022_product_pack_parent` entry (the last entry).
- Modify: `src/lib/products.ts` — remove `packChildren`, `isPack`, `packParentId` from `ProductInput` & `ProductPatch`, and `packParentId` from the `listAllProducts` select.
- Modify: `src/lib/shopping.ts` — remove `hasVariants`, `setPackCounts`, and restore `recordPurchase` + `updatePurchase` to always create/resync the single movement (i.e. remove the `hasVariants` guard).
- Modify: `src/app/api/purchases/[id]/route.ts` — remove the `setPackCounts` import and the `packCounts` block.
- Modify: `src/app/api/products/route.ts` — remove the `packParentId` line from the `createProduct` call.
- Modify: `src/app/api/products/[id]/route.ts` — remove the `packParentId` patch line.
- Modify: `src/components/Bill.tsx` — restore to its pre-pivot state (drop `variants` prop, `isPack`, packet inputs; `Product` type back to `{ id; name; ingredientId }`; qty field unconditional).
- Modify: `src/components/EntityForm.tsx` — restore the `select` branch (remove the "— none —" option block).
- Modify: `src/app/manage/entities.tsx` — remove the `packParentId` field and the two `packParentId` payload lines.
- Modify: `src/lib/shopping.test.ts` — remove the `setPackCounts` import and the entire `describe("assorted packs", ...)` block.

- [ ] **Step 1: Revert all files listed above.** Easiest path if the working tree has no other wanted changes in these files: `git checkout -- <each unstaged file>` for the ones that existed before, and delete the new migration. Verify nothing else depended on the removed symbols.

- [ ] **Step 2: Drop the column from the dev DB**

Run: `sqlite3 ./mealpal.db "ALTER TABLE products DROP COLUMN pack_parent_id;"`
Expected: no output (success). If it errors that the column is missing, that's fine — continue.

- [ ] **Step 3: Verify clean**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4`
Expected: tsc silent; all tests pass (back to 99 pre-pivot tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "revert: drop parent-child pack approach in favor of variants"
```

---

## Phase 1 — Schema

### Task 1: Add `product_variants` and `consumptions` tables

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0022_variants_and_consumptions.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add both tables to `src/db/schema.ts`** (append after the `products` table)

```ts
// An assorted product (e.g. a trail-mix bag) can carry several nutrition
// profiles — one per assorted type. Values are PER CANONICAL UNIT of the parent
// product's ingredient (use unit 'count' so one packet = one unit = one serving).
// null on a field = not filled in yet, same convention as products.
export const productVariants = sqliteTable("product_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  nutritionPhoto: text("nutrition_photo"),
  calories: real("calories"),
  fatG: real("fat_g"),
  satFatG: real("sat_fat_g"),
  transFatG: real("trans_fat_g"),
  cholesterolMg: real("cholesterol_mg"),
  sodiumMg: real("sodium_mg"),
  carbsG: real("carbs_g"),
  fiberG: real("fiber_g"),
  sugarG: real("sugar_g"),
  addedSugarG: real("added_sugar_g"),
  proteinG: real("protein_g"),
  polyFatG: real("poly_fat_g"),
  monoFatG: real("mono_fat_g"),
  vitaminDMcg: real("vitamin_d_mcg"),
  calciumMg: real("calcium_mg"),
  ironMg: real("iron_mg"),
  potassiumMg: real("potassium_mg"),
  vitaminAMcg: real("vitamin_a_mcg"),
  vitaminCMg: real("vitamin_c_mg"),
});

// The quick eat-log: one row per packet (or count) eaten on a date. variantId
// names which nutrition profile when the product is assorted; null = the
// product's own nutrition. Pairs with an 'eaten' stock movement that depletes
// the product.
export const consumptions = sqliteTable("consumptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  date: text("date").notNull(), // YYYY-MM-DD, local date-only (no tz games)
  productId: integer("product_id").notNull().references(() => products.id),
  variantId: integer("variant_id").references(() => productVariants.id),
  count: integer("count").notNull().default(1), // canonical units eaten
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Add `"eaten"` to the stock movement reason union** in `src/lib/stock.ts:12`

Change `reason: "purchase" | "cooked" | "manual";` to:
```ts
  reason: "purchase" | "cooked" | "manual" | "eaten";
```
Also update the `// 'purchase' | 'cooked' | 'manual'` comment on `reason` in `src/db/schema.ts` (stockMovements) to add `| 'eaten'`.

- [ ] **Step 3: Write the migration** `drizzle/0022_variants_and_consumptions.sql`

```sql
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`name` text NOT NULL,
	`nutrition_photo` text,
	`calories` real,
	`fat_g` real,
	`sat_fat_g` real,
	`trans_fat_g` real,
	`cholesterol_mg` real,
	`sodium_mg` real,
	`carbs_g` real,
	`fiber_g` real,
	`sugar_g` real,
	`added_sugar_g` real,
	`protein_g` real,
	`poly_fat_g` real,
	`mono_fat_g` real,
	`vitamin_d_mcg` real,
	`calcium_mg` real,
	`iron_mg` real,
	`potassium_mg` real,
	`vitamin_a_mcg` real,
	`vitamin_c_mg` real,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`date` text NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`)
);
```

- [ ] **Step 4: Append the journal entry** to `drizzle/meta/_journal.json` (after the `0021_product_micros` entry)

```json
    ,{
      "idx": 22,
      "version": "6",
      "when": 1782689253992,
      "tag": "0022_variants_and_consumptions",
      "breakpoints": true
    }
```
(Insert correctly as a new array element — comma placement must keep valid JSON.)

- [ ] **Step 5: Apply + verify**

Run: `npm run db:migrate && sqlite3 ./mealpal.db ".tables" | tr ' ' '\n' | grep -E "product_variants|consumptions"`
Expected: both table names print.

- [ ] **Step 6: Verify the in-memory test DB migrates** (this is what every test uses)

Run: `npm test 2>&1 | tail -4`
Expected: all tests still pass (the new migration applies cleanly in `makeTestDb`).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/stock.ts drizzle/0022_variants_and_consumptions.sql drizzle/meta/_journal.json
git commit -m "feat(db): add product_variants and consumptions tables"
```

---

## Phase 2 — Variants library (CRUD)

### Task 2: `src/lib/variants.ts`

**Files:**
- Create: `src/lib/variants.ts`
- Test: `src/lib/variants.test.ts`

Reuse `NUTRIENT_PATCH_KEYS` from `@/lib/products` for the nutrient set.

- [ ] **Step 1: Write the failing test** `src/lib/variants.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { createVariant, listVariants, updateVariant, deleteVariant } from "@/lib/variants";

let db: TestDb; let hid: number; let productId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  const ing = db.insert(schema.ingredients).values({ householdId: hid, name: "Trail Mix", canonicalUnit: "count" }).returning().all()[0].id;
  const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, { ingredientId: ing, shopId: shop, name: "Power Up Bag (16)", packSize: 16, priority: 1, url: null }).id;
});

describe("variants CRUD", () => {
  it("creates, lists, updates and deletes variants scoped to a product", () => {
    const a = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180, proteinG: 6 });
    const b = createVariant(db, hid, productId, { name: "High Energy", calories: 200 });
    expect(listVariants(db, hid, productId).map((v) => v.name)).toEqual(["Mega Omega", "High Energy"]);

    updateVariant(db, hid, a.id, { calories: 190 });
    expect(listVariants(db, hid, productId).find((v) => v.id === a.id)!.calories).toBe(190);

    expect(deleteVariant(db, hid, b.id)).toBe(true);
    expect(listVariants(db, hid, productId)).toHaveLength(1);
  });

  it("scopes by household — can't touch another home's variant", () => {
    const other = seedHousehold(db, "Other");
    const v = createVariant(db, hid, productId, { name: "Mega Omega" });
    expect(updateVariant(db, other, v.id, { calories: 5 })).toBeUndefined();
    expect(deleteVariant(db, other, v.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/variants.test.ts`
Expected: FAIL — `createVariant` not exported.

- [ ] **Step 3: Implement** `src/lib/variants.ts`

```ts
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

type Db = BetterSQLite3Database<typeof schema>;

export type VariantNutrients = Partial<Record<(typeof NUTRIENT_PATCH_KEYS)[number], number | null>>;
export interface VariantInput extends VariantNutrients { name: string; nutritionPhoto?: string | null; }
export type VariantPatch = Partial<VariantInput>;

export function createVariant(db: Db, householdId: number, productId: number, input: VariantInput) {
  const [row] = db.insert(schema.productVariants)
    .values({ householdId, productId, ...input })
    .returning().all();
  return row;
}

export function listVariants(db: Db, householdId: number, productId: number) {
  return db.select().from(schema.productVariants)
    .where(and(
      eq(schema.productVariants.householdId, householdId),
      eq(schema.productVariants.productId, productId),
    ))
    .orderBy(asc(schema.productVariants.id))
    .all();
}

export function updateVariant(db: Db, householdId: number, id: number, patch: VariantPatch) {
  const [row] = db.update(schema.productVariants)
    .set(patch)
    .where(and(eq(schema.productVariants.id, id), eq(schema.productVariants.householdId, householdId)))
    .returning().all();
  return row; // undefined if out of household scope
}

export function deleteVariant(db: Db, householdId: number, id: number): boolean {
  // consumptions referencing this variant keep their row but lose the link
  db.update(schema.consumptions).set({ variantId: null })
    .where(and(eq(schema.consumptions.householdId, householdId), eq(schema.consumptions.variantId, id))).run();
  return db.delete(schema.productVariants)
    .where(and(eq(schema.productVariants.id, id), eq(schema.productVariants.householdId, householdId)))
    .returning().all().length > 0;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/lib/variants.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/variants.ts src/lib/variants.test.ts
git commit -m "feat(variants): CRUD for product variants"
```

---

## Phase 3 — Eat-log library

### Task 3: `src/lib/eaten.ts` — log a packet, list a day's log

**Files:**
- Create: `src/lib/eaten.ts`
- Test: `src/lib/eaten.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/eaten.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { createVariant } from "@/lib/variants";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";
import { logEaten, listEaten } from "@/lib/eaten";

let db: TestDb; let hid: number; let ingId: number; let productId: number; let variantId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  ingId = db.insert(schema.ingredients).values({ householdId: hid, name: "Trail Mix", canonicalUnit: "count" }).returning().all()[0].id;
  const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, { ingredientId: ingId, shopId: shop, name: "Power Up Bag (16)", packSize: 16, priority: 1, url: null }).id;
  variantId = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180 }).id;
  recordPurchase(db, hid, { productId, quantity: 1 }); // +16 count in stock
});

describe("logEaten", () => {
  it("records a consumption and depletes the product's stock", () => {
    logEaten(db, hid, { date: "2026-06-29", productId, variantId, count: 1 });
    expect(currentStock(db, hid, ingId)).toBe(15); // 16 - 1
    const rows = listEaten(db, hid, "2026-06-29");
    expect(rows).toHaveLength(1);
    expect(rows[0].variantId).toBe(variantId);
    expect(rows[0].count).toBe(1);
  });

  it("lists only the asked-for date", () => {
    logEaten(db, hid, { date: "2026-06-29", productId, variantId, count: 2 });
    logEaten(db, hid, { date: "2026-06-30", productId, variantId, count: 1 });
    expect(listEaten(db, hid, "2026-06-29")).toHaveLength(1);
    expect(listEaten(db, hid, "2026-06-29")[0].count).toBe(2);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/eaten.test.ts`
Expected: FAIL — `logEaten` not exported.

- [ ] **Step 3: Implement** `src/lib/eaten.ts`

```ts
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface EatInput { date: string; productId: number; variantId?: number | null; count?: number; }

/** Log eating `count` units of a product (optionally a specific variant) on a
 * date: writes a consumption row + an 'eaten' stock movement that depletes the
 * product's ingredient. */
export function logEaten(db: Db, householdId: number, input: EatInput) {
  const count = input.count && input.count > 0 ? input.count : 1;
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [row] = tx.insert(schema.consumptions)
      .values({ householdId, date: input.date, productId: input.productId, variantId: input.variantId ?? null, count })
      .returning().all();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId, productId: product.id,
      delta: -count, reason: "eaten",
    }).run();
    return row;
  });
}

export function listEaten(db: Db, householdId: number, date: string) {
  return db.select().from(schema.consumptions)
    .where(and(eq(schema.consumptions.householdId, householdId), eq(schema.consumptions.date, date)))
    .orderBy(asc(schema.consumptions.id))
    .all();
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/lib/eaten.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/eaten.ts src/lib/eaten.test.ts
git commit -m "feat(eaten): quick eat-log with stock depletion"
```

---

## Phase 4 — Fold eaten packets into daily nutrition

### Task 4: `dayNutrition` and `dayIngredientTable` include the eat-log

**Files:**
- Modify: `src/lib/nutrition.ts`
- Test: `src/lib/nutrition.test.ts` (add a case)

The new contribution: each consumption on the date adds `variant_nutrients × count` (or the product's own nutrients when `variantId` is null). Variant nutrients use the same `NUTRIENT_KEYS` shape as products.

- [ ] **Step 1: Add a failing test** to `src/lib/nutrition.test.ts` (new `describe`)

```ts
import { logEaten } from "@/lib/eaten";
import { createVariant } from "@/lib/variants";
// ...inside the file, add:

describe("dayNutrition includes the eat-log", () => {
  it("adds an eaten variant's nutrition to the day total", () => {
    // assumes a household `hid`, a product `productId` (ingredient unit 'count')
    // set up like the other tests in this file; mirror that fixture here.
    const v = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180, proteinG: 6 });
    logEaten(db, hid, { date: "2026-06-29", productId, variantId: v.id, count: 2 });
    const day = dayNutrition(db, hid, "2026-06-29");
    expect(day.total.calories).toBe(360); // 180 × 2
    expect(day.total.proteinG).toBe(12);
  });
});
```
> Note for implementer: build the `db/hid/productId` fixture in this `describe`'s own `beforeEach` matching the style already used at the top of `nutrition.test.ts` (seedHousehold + ingredient unit `"count"` + createProduct). Don't assume outer-scope vars exist.

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/nutrition.test.ts`
Expected: FAIL — `day.total.calories` is 0 (eat-log not summed yet).

- [ ] **Step 3: Implement** in `src/lib/nutrition.ts`

Add an import at top:
```ts
import { listEaten } from "@/lib/eaten";
```

Add a helper near `productNutrients` (reuse the same null→0 mapping):
```ts
type VariantRow = typeof schema.productVariants.$inferSelect;
/** A variant's per-unit nutrients, or null if nothing is filled in. */
function variantNutrients(v: VariantRow): Nutrients | null {
  if (!NUTRIENT_KEYS.some((k) => ((v[k] as number | null) ?? 0) !== 0)) return null;
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, (v[k] as number | null) ?? 0])) as Nutrients;
}
```

In `dayNutrition`, after the `for (const ev of events)` loop builds `meals` and before computing `total`, append eat-log entries:
```ts
  // Quick-logged snacks/packets eaten this day (not part of a recipe meal).
  const variantById = new Map(
    db.select().from(schema.productVariants).where(eq(schema.productVariants.householdId, householdId)).all()
      .map((v) => [v.id, v]),
  );
  for (const c of listEaten(db, householdId, date)) {
    const p = productById.get(c.productId);
    const n = c.variantId != null ? (variantById.get(c.variantId) && variantNutrients(variantById.get(c.variantId)!))
                                   : (p ? productNutrients(p) : null);
    const nutrients = zeroNutrients();
    const miss = new Set<number>();
    if (n) addScaled(nutrients, n, c.count);
    else if (p) miss.add(p.ingredientId);
    meals.push({
      eventId: -c.id, // negative id namespace so it can't collide with mealEvents
      recipeName: c.variantId != null ? (variantById.get(c.variantId)?.name ?? p?.name ?? "Snack") : (p?.name ?? "Snack"),
      slotName: "Snack",
      servings: c.count,
      estimate: false,
      nutrients,
      missing: [...miss].map((id) => ingredientName.get(id) ?? "?"),
    });
  }
```

In `dayIngredientTable`, after the `for (const ev of events)` loop, add the eat-log to the per-ingredient accumulation. Reuse the existing `accumulate` helper but it takes a `ProductRow`; for variants build a synthetic nutrient-bearing row by passing the variant's values. Simplest: extend `accumulate` is overkill — instead inline:
```ts
  const variantById = new Map(
    db.select().from(schema.productVariants).where(eq(schema.productVariants.householdId, householdId)).all()
      .map((v) => [v.id, v]),
  );
  for (const c of listEaten(db, householdId, date)) {
    const p = productById.get(c.productId);
    if (!p) continue;
    const src = c.variantId != null ? variantById.get(c.variantId) : p;
    if (!src) continue;
    const ing = ingredientById.get(p.ingredientId);
    let rowKey = p.ingredientId;
    let row = rows.get(rowKey);
    if (!row) { row = { ingredientId: rowKey, name: ing?.name ?? "?", unit: ing?.canonicalUnit ?? "", productName: c.variantId != null ? (variantById.get(c.variantId)?.name ?? p.name) : p.name, qty: 0, values: {} }; rows.set(rowKey, row); }
    row.qty += c.count;
    for (const k of NUTRIENT_PATCH_KEYS) {
      const val = (src as Record<string, unknown>)[k] as number | null | undefined;
      if (val == null) continue;
      row.values[k] = (row.values[k] ?? 0) + val * c.count;
    }
  }
```
(`ingredientById` and `rows` already exist in `dayIngredientTable`. Add the `NUTRIENT_PATCH_KEYS` import if not present — it is already imported.)

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/lib/nutrition.test.ts`
Expected: PASS, including the new case.

- [ ] **Step 5: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4`
Expected: tsc silent; all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutrition.ts src/lib/nutrition.test.ts
git commit -m "feat(nutrition): count quick-logged packets in the daily totals"
```

---

## Phase 5 — APIs

### Task 5: Variants endpoints

**Files:**
- Create: `src/app/api/products/[id]/variants/route.ts` (GET list, POST create)
- Create: `src/app/api/variants/[id]/route.ts` (PATCH, DELETE)

Follow the auth + household pattern from `src/app/api/products/[id]/route.ts`. Accept nutrient keys via the same `NUTRIENT_PATCH_KEYS` filter.

- [ ] **Step 1: Create** `src/app/api/products/[id]/variants/route.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createVariant, listVariants } from "@/lib/variants";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listVariants(db, session.user.householdId, Number((await params).id)));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await params).id);
  const b = await req.json().catch(() => null);
  const name = b?.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const nutrients: Record<string, number | null> = {};
  for (const k of NUTRIENT_PATCH_KEYS) if (b?.[k] !== undefined) nutrients[k] = b[k] === null ? null : Number(b[k]);
  const row = createVariant(db, session.user.householdId, productId, {
    name, nutritionPhoto: b?.nutritionPhoto ?? null, ...nutrients,
  });
  return NextResponse.json(row, { status: 201 });
}
```

- [ ] **Step 2: Create** `src/app/api/variants/[id]/route.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updateVariant, deleteVariant, type VariantPatch } from "@/lib/variants";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const patch: VariantPatch = {};
  if (b?.name !== undefined) patch.name = String(b.name).trim();
  if (b?.nutritionPhoto !== undefined) patch.nutritionPhoto = b.nutritionPhoto === null ? null : String(b.nutritionPhoto);
  for (const k of NUTRIENT_PATCH_KEYS) if (b?.[k] !== undefined) patch[k] = b[k] === null ? null : Number(b[k]);
  const row = updateVariant(db, session.user.householdId, Number((await params).id), patch);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = deleteVariant(db, session.user.householdId, Number((await params).id));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/products/[id]/variants/route.ts src/app/api/variants/[id]/route.ts
git commit -m "feat(api): product variants endpoints"
```

### Task 6: Eat-log endpoint

**Files:**
- Create: `src/app/api/eaten/route.ts` (POST log, GET by date)

- [ ] **Step 1: Create** `src/app/api/eaten/route.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { logEaten, listEaten } from "@/lib/eaten";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return NextResponse.json(listEaten(db, session.user.householdId, date));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = Number(b?.productId);
  const date = b?.date;
  if (!productId || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "productId and date=YYYY-MM-DD required" }, { status: 400 });
  const row = logEaten(db, session.user.householdId, {
    date, productId,
    variantId: b?.variantId != null && b.variantId !== "" ? Number(b.variantId) : null,
    count: b?.count != null ? Number(b.count) : 1,
  });
  return NextResponse.json(row, { status: 201 });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/api/eaten/route.ts
git commit -m "feat(api): quick eat-log endpoint"
```

---

## Phase 6 — UI

### Task 7: Variant editor on the product page

**Files:**
- Modify: `src/components/ProductDetail.tsx`
- Create: `src/components/VariantsEditor.tsx`

A "Variants" section under the product: list each variant with its calories, an "Add variant" form (name + the nutrition number fields reusing `FACT_ROWS`/`FactKey` from `@/components/NutritionFacts`), edit and delete. Values are per packet (unit `count`).

- [ ] **Step 1: Create** `src/components/VariantsEditor.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { FACT_ROWS, type FactKey } from "@/components/NutritionFacts";

type Variant = { id: number; name: string } & Partial<Record<FactKey, number | null>>;
const NUM_KEYS: FactKey[] = ["calories", ...FACT_ROWS.map((r) => r.key)];
const LABELS: Record<string, string> = { calories: "Calories", ...Object.fromEntries(FACT_ROWS.map((r) => [r.key, r.label])) };

export function VariantsEditor({ productId, unit }: { productId: number; unit: string }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function reload() {
    fetch(`/api/products/${productId}/variants`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }
  useEffect(reload, [productId]);

  function num(v: string | undefined) { return v != null && v !== "" ? Number(v) : undefined; }

  async function add() {
    if (!draft.name?.trim()) return;
    setBusy(true);
    const body: Record<string, unknown> = { name: draft.name.trim() };
    for (const k of NUM_KEYS) { const n = num(draft[k]); if (n !== undefined) body[k] = n; }
    await fetch(`/api/products/${productId}/variants`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(false); setDraft({}); reload();
  }

  async function remove(id: number) {
    await fetch(`/api/variants/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <span className="section-label">Variants (per {unit || "packet"})</span>
      <section className="card stack-sm">
        {rows.length === 0 && <p className="empty">No variants — add the assorted types below.</p>}
        {rows.map((v) => (
          <div key={v.id} className="ing-row" style={{ paddingTop: 0 }}>
            <span style={{ flex: 1 }}>{v.name}</span>
            <span className="meta">{v.calories != null ? `${v.calories} cal` : "—"}</span>
            <button type="button" aria-label={`Delete ${v.name}`} onClick={() => remove(v.id)} style={{ color: "var(--paprika)" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <input className="input" placeholder="Variant name (e.g. Mega Omega)"
            value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          {NUM_KEYS.map((k) => (
            <label key={k} className="eb" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{LABELS[k] ?? k}</span>
              <input className="input mono" inputMode="decimal" style={{ width: 90 }}
                value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^0-9.]/g, "") }))} />
            </label>
          ))}
          <button type="button" className="btn" onClick={add} disabled={busy || !draft.name?.trim()}>
            {busy ? "…" : "Add variant"}
          </button>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Mount it in `ProductDetail.tsx`** — import and render after the Nutrition facts section (around line 167), passing the ingredient unit:

```tsx
import { VariantsEditor } from "@/components/VariantsEditor";
// ...after the nutrition-facts block:
<VariantsEditor productId={product.id} unit={unit} />
```

- [ ] **Step 3: Verify build + lint touched files**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -E "VariantsEditor|ProductDetail" || echo "clean"`
Expected: tsc silent; "clean" (no new lint errors in these files).

- [ ] **Step 4: Commit**

```bash
git add src/components/VariantsEditor.tsx src/components/ProductDetail.tsx
git commit -m "feat(ui): edit assorted-pack variants on the product page"
```

### Task 8: Quick "ate this" log on the Nutrition page

**Files:**
- Create: `src/components/QuickEat.tsx`
- Modify: `src/app/nutrition/page.tsx` (mount QuickEat in the day view, reload analysis after logging)

A control on the Nutrition tab's day view: pick a product, pick a variant (if it has any), tap "Ate it" → POST `/api/eaten` for the selected `date`, then trigger the page's existing `reloadKey` bump so totals refresh.

- [ ] **Step 1: Create** `src/components/QuickEat.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";

type Product = { id: number; name: string };
type Variant = { id: number; name: string };

export function QuickEat({ date, onLogged }: { date: string; onLogged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    setVariants([]); setVariantId(null);
    if (productId == null) return;
    fetch(`/api/products/${productId}/variants`).then((r) => (r.ok ? r.json() : [])).then(setVariants).catch(() => {});
  }, [productId]);

  async function logIt() {
    if (productId == null) return;
    setBusy(true);
    await fetch("/api/eaten", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, productId, variantId, count: 1 }),
    });
    setBusy(false);
    onLogged();
  }

  return (
    <section className="card stack-sm">
      <span className="eb">Ate a snack/packet</span>
      <Dropdown label="Product" value={productId} options={products.map((p) => ({ id: p.id, label: p.name }))}
        onChange={(v) => setProductId(Number(v))} />
      {variants.length > 0 && (
        <Dropdown label="Which variant?" value={variantId} options={variants.map((v) => ({ id: v.id, label: v.name }))}
          onChange={(v) => setVariantId(Number(v))} />
      )}
      <button type="button" className="btn" disabled={busy || productId == null} onClick={logIt}>
        {busy ? "…" : "Ate it"}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Mount in `src/app/nutrition/page.tsx`** — import `QuickEat`, and in the day-view branch (where `mode === "day"`) render it, wiring `onLogged` to bump the existing reload key:

```tsx
import { QuickEat } from "@/components/QuickEat";
// inside the day view render, e.g. above the meals list:
{mode === "day" && <QuickEat date={date} onLogged={() => setReloadKey((k) => k + 1)} />}
```
> The page already has `date`, `mode`, and `setReloadKey` in scope (see `page.tsx:18-23`). `reqKey` includes `reloadKey`, so bumping it refetches the analysis.

- [ ] **Step 3: Verify build + lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -E "QuickEat|nutrition/page" || echo "clean"`
Expected: tsc silent; "clean".

- [ ] **Step 4: Commit**

```bash
git add src/components/QuickEat.tsx src/app/nutrition/page.tsx
git commit -m "feat(ui): quick eat-log on the nutrition page"
```

---

## Phase 7 — End-to-end verification

### Task 9: Manual smoke test

- [ ] **Step 1: Run the app** `npm run dev`, log in (demo user), then:
  1. Manage → Products → open the trail-mix bag (ingredient unit should be `count`, pack size 16). Add 3 variants (Mega Omega / High Energy / Antioxidant Mix) each with calories + macros.
  2. Shop → record buying the bag → confirm Pantry shows +16 count.
  3. Nutrition (day = today) → "Ate a snack/packet" → pick the bag → pick "Mega Omega" → "Ate it".
  4. Confirm: the day total calories rises by the Mega Omega value, a "Snack · Mega Omega" line appears, and Pantry shows 15 count.

- [ ] **Step 2: Final full check**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4 && npm run lint 2>&1 | tail -3`
Expected: tsc silent; all tests pass; no new lint errors in created/modified files.

---

## Self-review notes (resolved)

- **Spec coverage:** variants storage (Task 1–2), per-packet nutrition (Task 1 columns, unit `count`), eat-log + stock depletion (Task 3), daily-total inclusion (Task 4), editing variants (Task 7), logging eating (Task 8), price (unchanged — the bag is an ordinary priced product). ✓
- **Eat-path = "quick log":** no recipe/meal-event changes; consumptions is a parallel source folded into `dayNutrition`. ✓
- **Type consistency:** `VariantInput`/`VariantPatch` (variants.ts) reused by APIs; `EatInput` (eaten.ts) reused by `/api/eaten`; nutrient set is always `NUTRIENT_PATCH_KEYS`/`NUTRIENT_KEYS`. ✓
- **No per-variant price:** deliberate — you buy the bag, not the packet; per-packet cost (if ever wanted) = bag price ÷ packSize, derivable later. Not in scope.
