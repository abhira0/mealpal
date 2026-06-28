# MealPal Kitchen Loop Implementation Plan (Phases 3–5: Recipes, Planning/Inventory, Shopping)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop — recipes, a meal plan (planned vs cooked events sharing one consumption formula), inventory derived from a movement ledger, run-out prediction, and a shop-grouped shopping checklist whose check-offs restock inventory.

**Architecture:** Builds on Foundation + Catalog. Task 1 (serial) defines ALL tables for phases 3–5 in one migration — the shared bedrock. Tasks 2–4 (parallel wave) are independent leaf modules: recipe CRUD, meal-slot config, and manual stock adjustments — no cross-imports. Tasks 5–8 (serial tail) are the coupled engine, each importing the previous: `computeConsumption` → `currentStock`/cook-a-meal → `predictRunout` → shop-grouped recommendation + checklist/purchase→restock. Inventory is an append-only `stock_movements` ledger: current stock = SUM(delta); purchases add, cooking subtracts, manual adjustments correct. `predictRunout` is a pure function — point estimate from planned consumption, widened by historical variance, collapsing to the point estimate (+ a safety buffer) when history is thin.

**Tech Stack:** Same as before — Next.js 16, TypeScript, better-sqlite3, Drizzle, Vitest. No new dependencies.

**Context for implementers:**
- Patterns: data-layer modules take `db` as first arg (`type Db = BetterSQLite3Database<typeof schema>`), scope by `householdId`, use `.returning().all()`. See `src/lib/ingredients.ts`, `src/lib/products.ts`.
- Tests use `makeTestDb()` (`src/test/db.ts`) + `seedHousehold(db)` (`src/test/fixtures.ts`). `foreign_keys` is ON — seed a household and any referenced rows first.
- API routes get the household via `const session = await auth()` (from `@/auth`), then `session.user.householdId`; return 401 if no session. Next 16 dynamic params are `Promise<{id}>` and must be awaited. Never import `@/db`/`@/auth` into middleware.
- Money is integer cents; use `src/lib/money.ts` (`dollarsToCents`/`centsToDollars`).
- Canonical units: an ingredient stores `canonicalUnit` and optional `servingSize` (canonical units per serving). Recipe amounts and stock deltas are in canonical units (integers).
- Commands: `npm run db:generate` + `npm run db:migrate`; `npm test`; `npx tsc --noEmit`.

---

## File Structure

- `src/db/schema.ts` — MODIFY: add `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_media`, `meal_slots`, `meal_events`, `stock_movements`, `purchases`.
- `src/lib/recipes.ts` (+ test) — recipe CRUD with nested ingredients/steps/media. API: `src/app/api/recipes/route.ts`, `src/app/api/recipes/[id]/route.ts`. Page: `src/app/recipes/page.tsx`.
- `src/lib/slots.ts` (+ test) — meal-slot config CRUD. API: `src/app/api/slots/route.ts`. Page folded into the plan page.
- `src/lib/stock.ts` (+ test) — movement ledger: `recordMovement`, `currentStock`, `stockByIngredient`, `adjustStock`. API: `src/app/api/stock/route.ts`.
- `src/lib/consumption.ts` (+ test) — pure `consumptionForRecipe(recipe, servings)` and `recordCooked(db, ...)` (writes negative movements). Uses recipes + stock.
- `src/lib/plan.ts` (+ test) — meal-event CRUD (planned/cooked), `plannedConsumption(db, householdId, fromDate, days)`.
- `src/lib/predict.ts` (+ test) — pure `predictRunout(input)`; `runoutForHousehold(db, ...)` wiring.
- `src/lib/shopping.ts` (+ test) — `buyRecommendation` (group needed products by shop) + `recordPurchase` (writes purchase + stock movement + price). API: `src/app/api/shopping/route.ts`, `src/app/api/purchases/route.ts`. Page: `src/app/shopping/page.tsx`.
- `src/app/plan/page.tsx` — the planning view.

---

## Task 1: Combined schema + migration (SERIAL — must complete before all others)

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Append the phase 3–5 tables**

Append to `src/db/schema.ts` (keep all existing tables and the existing imports):

```ts
export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  baseServings: integer("base_servings").notNull().default(1),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  // amount in the ingredient's canonical unit, for baseServings
  amount: integer("amount").notNull(),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

export const recipeMedia = sqliteTable("recipe_media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  kind: text("kind").notNull(), // 'photo' | 'video' | 'youtube'
  url: text("url").notNull(),
});

export const mealSlots = sqliteTable("meal_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const mealEvents = sqliteTable("meal_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  // calendar date as YYYY-MM-DD text (date-only, no tz games)
  date: text("date").notNull(),
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  servings: integer("servings").notNull().default(1),
  status: text("status").notNull().default("planned"), // 'planned' | 'cooked'
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  // signed canonical units: + purchase, - cooked, +/- manual
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // 'purchase' | 'cooked' | 'manual'
  mealEventId: integer("meal_event_id").references(() => mealEvents.id),
  purchaseId: integer("purchase_id"),
  at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  cents: integer("cents").notNull(),
  purchasedAt: integer("purchased_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Generate and apply migration**

```bash
npm run db:generate && npm run db:migrate
```

Expected: `drizzle/0002_*.sql` created and applied. Verify with `sqlite3 mealpal.db ".tables"` — includes `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_media`, `meal_slots`, `meal_events`, `stock_movements`, `purchases`.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → existing 16 pass.

```bash
git add -A && git commit -m "feat: add kitchen-loop schema (recipes, plan, stock, purchases)"
```

---

## Task 2: Recipe CRUD (PARALLEL WAVE — after Task 1)

**Files:** `src/lib/recipes.ts` (+ `src/lib/recipes.test.ts`), `src/app/api/recipes/route.ts`, `src/app/api/recipes/[id]/route.ts`, `src/app/recipes/page.tsx`

- [ ] **Step 1: Write the failing test** — `src/lib/recipes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe, getRecipe, listRecipes } from "@/lib/recipes";

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
});

describe("recipes", () => {
  it("creates a recipe with ingredients, steps, and media and reads it back", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 500 }],
      steps: ["Mix", "Bake"],
      media: [{ kind: "youtube", url: "https://youtu.be/x" }],
    });
    const full = getRecipe(db, hid, r.id);
    expect(full?.name).toBe("Bread");
    expect(full?.ingredients).toHaveLength(1);
    expect(full?.ingredients[0].amount).toBe(500);
    expect(full?.steps.map((s) => s.text)).toEqual(["Mix", "Bake"]);
    expect(full?.media[0].url).toBe("https://youtu.be/x");
  });

  it("scopes recipes to the household", () => {
    const other = seedHousehold(db, "Other");
    createRecipe(db, other, { name: "Secret", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] });
    expect(listRecipes(db, hid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm fail** — `npm test -- src/lib/recipes.test.ts` → FAIL (unresolved `@/lib/recipes`).

- [ ] **Step 3: Implement** — `src/lib/recipes.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface RecipeInput {
  name: string;
  baseServings: number;
  notes: string | null;
  ingredients: { ingredientId: number; amount: number }[];
  steps: string[];
  media: { kind: string; url: string }[];
}

export function createRecipe(db: Db, householdId: number, input: RecipeInput) {
  return db.transaction((tx) => {
    const [recipe] = tx.insert(schema.recipes)
      .values({ householdId, name: input.name, baseServings: input.baseServings, notes: input.notes })
      .returning().all();
    for (const ing of input.ingredients) {
      tx.insert(schema.recipeIngredients)
        .values({ recipeId: recipe.id, ingredientId: ing.ingredientId, amount: ing.amount }).run();
    }
    input.steps.forEach((text, i) => {
      tx.insert(schema.recipeSteps).values({ recipeId: recipe.id, position: i, text }).run();
    });
    for (const m of input.media) {
      tx.insert(schema.recipeMedia).values({ recipeId: recipe.id, kind: m.kind, url: m.url }).run();
    }
    return recipe;
  });
}

export function listRecipes(db: Db, householdId: number) {
  return db.select().from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId)).all();
}

export function getRecipe(db: Db, householdId: number, id: number) {
  const [recipe] = db.select().from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId))).all();
  if (!recipe) return undefined;
  const ingredients = db.select().from(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.recipeId, id)).all();
  const steps = db.select().from(schema.recipeSteps)
    .where(eq(schema.recipeSteps.recipeId, id)).orderBy(asc(schema.recipeSteps.position)).all();
  const media = db.select().from(schema.recipeMedia)
    .where(eq(schema.recipeMedia.recipeId, id)).all();
  return { ...recipe, ingredients, steps, media };
}
```

- [ ] **Step 4: Run to confirm pass** — `npm test -- src/lib/recipes.test.ts` → PASS (2 tests).

- [ ] **Step 5: API routes** — `src/app/api/recipes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createRecipe, listRecipes } from "@/lib/recipes";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listRecipes(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const row = createRecipe(db, session.user.householdId, {
    name: String(b.name).trim(),
    baseServings: Number(b.baseServings) || 1,
    notes: b.notes?.trim() || null,
    ingredients: Array.isArray(b.ingredients)
      ? b.ingredients.map((i: { ingredientId: number; amount: number }) => ({ ingredientId: Number(i.ingredientId), amount: Number(i.amount) }))
      : [],
    steps: Array.isArray(b.steps) ? b.steps.map((s: string) => String(s)) : [],
    media: Array.isArray(b.media)
      ? b.media.map((m: { kind: string; url: string }) => ({ kind: String(m.kind), url: String(m.url) }))
      : [],
  });
  return NextResponse.json(row, { status: 201 });
}
```

`src/app/api/recipes/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getRecipe } from "@/lib/recipes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const recipe = getRecipe(db, session.user.householdId, Number(id));
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}
```

- [ ] **Step 6: Page** — `src/app/recipes/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { listRecipes } from "@/lib/recipes";

export default async function RecipesPage() {
  const session = await auth();
  const rows = session ? listRecipes(db, session.user.householdId) : [];
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Recipes</h1>
      <ul>{rows.map((r) => <li key={r.id}>{r.name} (serves {r.baseServings})</li>)}</ul>
      {rows.length === 0 && <p>No recipes yet. POST to /api/recipes.</p>}
    </main>
  );
}
```

- [ ] **Step 7 (parallel-wave agents only): do NOT run git/tsc/full-test.** Run only `npm test -- src/lib/recipes.test.ts`. The controller commits centrally.

---

## Task 3: Meal-slot config (PARALLEL WAVE — after Task 1)

**Files:** `src/lib/slots.ts` (+ `src/lib/slots.test.ts`), `src/app/api/slots/route.ts`

- [ ] **Step 1: Failing test** — `src/lib/slots.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createSlot, listSlots, deleteSlot } from "@/lib/slots";

let db: TestDb;
let hid: number;
beforeEach(() => { db = makeTestDb(); hid = seedHousehold(db); });

describe("meal slots", () => {
  it("creates slots and lists them ordered by position", () => {
    createSlot(db, hid, "Dinner", 2);
    createSlot(db, hid, "Breakfast", 0);
    expect(listSlots(db, hid).map((s) => s.name)).toEqual(["Breakfast", "Dinner"]);
  });
  it("deletes a slot within the household only", () => {
    const s = createSlot(db, hid, "Snack", 5);
    const other = seedHousehold(db, "Other");
    expect(deleteSlot(db, other, s.id)).toBe(false); // wrong household
    expect(deleteSlot(db, hid, s.id)).toBe(true);
    expect(listSlots(db, hid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/slots.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/slots.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export function createSlot(db: Db, householdId: number, name: string, position = 0) {
  const [row] = db.insert(schema.mealSlots)
    .values({ householdId, name, position }).returning().all();
  return row;
}

export function listSlots(db: Db, householdId: number) {
  return db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId))
    .orderBy(asc(schema.mealSlots.position)).all();
}

export function deleteSlot(db: Db, householdId: number, id: number): boolean {
  const rows = db.delete(schema.mealSlots)
    .where(and(eq(schema.mealSlots.id, id), eq(schema.mealSlots.householdId, householdId)))
    .returning().all();
  return rows.length > 0;
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/slots.test.ts` → PASS (2 tests).

- [ ] **Step 5: API** — `src/app/api/slots/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createSlot, listSlots } from "@/lib/slots";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listSlots(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json(
    createSlot(db, session.user.householdId, String(b.name).trim(), Number(b.position) || 0),
    { status: 201 });
}
```

- [ ] **Step 6 (parallel-wave agents only): do NOT run git/tsc/full-test.** Run only `npm test -- src/lib/slots.test.ts`.

---

## Task 4: Stock movement ledger (PARALLEL WAVE — after Task 1)

**Files:** `src/lib/stock.ts` (+ `src/lib/stock.test.ts`), `src/app/api/stock/route.ts`

- [ ] **Step 1: Failing test** — `src/lib/stock.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { recordMovement, currentStock, stockByIngredient } from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
});

describe("stock ledger", () => {
  it("sums signed deltas into current stock", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 1000, reason: "purchase" });
    recordMovement(db, hid, { ingredientId: flourId, delta: -300, reason: "cooked" });
    expect(currentStock(db, hid, flourId)).toBe(700);
  });
  it("returns 0 for an ingredient with no movements", () => {
    expect(currentStock(db, hid, flourId)).toBe(0);
  });
  it("reports stock for every ingredient with movements, scoped to household", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual" });
    const map = stockByIngredient(db, hid);
    expect(map.get(flourId)).toBe(500);
  });
});
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/stock.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/stock.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface MovementInput {
  ingredientId: number;
  delta: number;
  reason: "purchase" | "cooked" | "manual";
  mealEventId?: number | null;
  purchaseId?: number | null;
}

export function recordMovement(db: Db, householdId: number, m: MovementInput) {
  const [row] = db.insert(schema.stockMovements)
    .values({
      householdId, ingredientId: m.ingredientId, delta: m.delta, reason: m.reason,
      mealEventId: m.mealEventId ?? null, purchaseId: m.purchaseId ?? null,
    }).returning().all();
  return row;
}

export function currentStock(db: Db, householdId: number, ingredientId: number): number {
  const [row] = db
    .select({ total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)` })
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      eq(schema.stockMovements.ingredientId, ingredientId),
    )).all();
  return row?.total ?? 0;
}

export function stockByIngredient(db: Db, householdId: number): Map<number, number> {
  const rows = db
    .select({
      ingredientId: schema.stockMovements.ingredientId,
      total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)`,
    })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.householdId, householdId))
    .groupBy(schema.stockMovements.ingredientId).all();
  return new Map(rows.map((r) => [r.ingredientId, r.total]));
}

/** Manual correction (spills, recounts). Positive or negative. */
export function adjustStock(db: Db, householdId: number, ingredientId: number, delta: number) {
  return recordMovement(db, householdId, { ingredientId, delta, reason: "manual" });
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/stock.test.ts` → PASS (3 tests).

- [ ] **Step 5: API** — `src/app/api/stock/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, adjustStock } from "@/lib/stock";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const map = stockByIngredient(db, session.user.householdId);
  return NextResponse.json(Object.fromEntries(map));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const delta = Number(b?.delta);
  if (!ingredientId || !Number.isFinite(delta))
    return NextResponse.json({ error: "ingredientId and numeric delta required" }, { status: 400 });
  return NextResponse.json(
    adjustStock(db, session.user.householdId, ingredientId, delta), { status: 201 });
}
```

- [ ] **Step 6 (parallel-wave agents only): do NOT run git/tsc/full-test.** Run only `npm test -- src/lib/stock.test.ts`.

---

## Task 5: Consumption engine + cooking (SERIAL TAIL — after parallel wave merged)

**Files:** `src/lib/consumption.ts` (+ `src/lib/consumption.test.ts`)

Depends on `src/lib/recipes.ts` (Task 2) and `src/lib/stock.ts` (Task 4).

- [ ] **Step 1: Failing test** — `src/lib/consumption.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { currentStock } from "@/lib/stock";
import { consumptionForRecipe, recordCooked } from "@/lib/consumption";

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
});

describe("consumption", () => {
  it("scales recipe amounts by servings/baseServings", () => {
    const recipe = { baseServings: 2, ingredients: [{ ingredientId: flourId, amount: 500 }] };
    expect(consumptionForRecipe(recipe, 4)).toEqual([{ ingredientId: flourId, amount: 1000 }]);
  });

  it("recording a cooked meal subtracts scaled amounts from stock", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
    });
    // seed 2000g flour
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    recordCooked(db, hid, r.id, 4 /* servings */, null);
    expect(currentStock(db, hid, flourId)).toBe(1000); // 2000 - (500 * 4/2)
  });
});
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/consumption.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/consumption.ts`:

```ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { recordMovement } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface ConsumptionLine { ingredientId: number; amount: number; }

/** Pure: scale a recipe's ingredient amounts to the requested servings. */
export function consumptionForRecipe(
  recipe: { baseServings: number; ingredients: { ingredientId: number; amount: number }[] },
  servings: number,
): ConsumptionLine[] {
  const factor = servings / recipe.baseServings;
  return recipe.ingredients.map((i) => ({
    ingredientId: i.ingredientId,
    amount: Math.round(i.amount * factor),
  }));
}

/** Mark a recipe cooked: write negative stock movements for each ingredient. */
export function recordCooked(
  db: Db, householdId: number, recipeId: number, servings: number, mealEventId: number | null,
) {
  const recipe = getRecipe(db, householdId, recipeId);
  if (!recipe) throw new Error("recipe not found in household");
  const lines = consumptionForRecipe(recipe, servings);
  for (const line of lines) {
    recordMovement(db, householdId, {
      ingredientId: line.ingredientId, delta: -line.amount, reason: "cooked", mealEventId,
    });
  }
  return lines;
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/consumption.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit** (controller, after spec+quality review):

```bash
git add -A && git commit -m "feat: add consumption engine and cooking depletion"
```

---

## Task 6: Meal-event plan + planned consumption (SERIAL TAIL)

**Files:** `src/lib/plan.ts` (+ `src/lib/plan.test.ts`), `src/app/api/events/route.ts`, `src/app/api/events/[id]/cook/route.ts`, `src/app/plan/page.tsx`

Depends on Task 5 (`recordCooked`), Task 2 (recipes), Task 3 (slots).

- [ ] **Step 1: Failing test** — `src/lib/plan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, listEvents, cookEvent, plannedConsumption } from "@/lib/plan";
import { currentStock } from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
let slotId: number;
let recipeId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
  slotId = createSlot(db, hid, "Dinner", 0).id;
  recipeId = createRecipe(db, hid, {
    name: "Bread", baseServings: 2, notes: null,
    ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
  }).id;
});

describe("meal plan", () => {
  it("adds planned events and lists them by date", () => {
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    const events = listEvents(db, hid, "2026-07-01", "2026-07-01");
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("planned");
  });

  it("sums planned consumption across the horizon (scaled by servings)", () => {
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 }); // 500g
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 4 }); // 1000g
    const map = plannedConsumption(db, hid, "2026-07-01", "2026-07-03");
    expect(map.get(flourId)).toBe(1500);
  });

  it("cooking an event flips status and depletes stock once", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500); // 2000 - 500
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("cooked");
    // cooking again is a no-op (already cooked)
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);
  });
});
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/plan.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/plan.ts`:

```ts
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { consumptionForRecipe, recordCooked } from "@/lib/consumption";

type Db = BetterSQLite3Database<typeof schema>;

export interface EventInput { date: string; slotId: number; recipeId: number; servings: number; }

export function addEvent(db: Db, householdId: number, input: EventInput) {
  const [row] = db.insert(schema.mealEvents)
    .values({ householdId, ...input, status: "planned" }).returning().all();
  return row;
}

export function listEvents(db: Db, householdId: number, from: string, to: string) {
  return db.select().from(schema.mealEvents)
    .where(and(
      eq(schema.mealEvents.householdId, householdId),
      gte(schema.mealEvents.date, from),
      lte(schema.mealEvents.date, to),
    ))
    .orderBy(asc(schema.mealEvents.date)).all();
}

/** Sum of planned (not yet cooked) consumption per ingredient over [from, to]. */
export function plannedConsumption(db: Db, householdId: number, from: string, to: string): Map<number, number> {
  const events = listEvents(db, householdId, from, to).filter((e) => e.status === "planned");
  const map = new Map<number, number>();
  for (const ev of events) {
    const recipe = getRecipe(db, householdId, ev.recipeId);
    if (!recipe) continue;
    for (const line of consumptionForRecipe(recipe, ev.servings)) {
      map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount);
    }
  }
  return map;
}

/** Mark an event cooked exactly once: deplete stock and flip status. */
export function cookEvent(db: Db, householdId: number, eventId: number) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status === "cooked") return; // no-op if missing or already cooked
  recordCooked(db, householdId, ev.recipeId, ev.servings, ev.id);
  db.update(schema.mealEvents).set({ status: "cooked" })
    .where(eq(schema.mealEvents.id, ev.id)).run();
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/plan.test.ts` → PASS (3 tests).

- [ ] **Step 5: API** — `src/app/api/events/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addEvent, listEvents } from "@/lib/plan";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "0000-01-01";
  const to = sp.get("to") ?? "9999-12-31";
  return NextResponse.json(listEvents(db, session.user.householdId, from, to));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.date || !b?.slotId || !b?.recipeId)
    return NextResponse.json({ error: "date, slotId, recipeId required" }, { status: 400 });
  return NextResponse.json(
    addEvent(db, session.user.householdId, {
      date: String(b.date), slotId: Number(b.slotId), recipeId: Number(b.recipeId),
      servings: Number(b.servings) || 1,
    }), { status: 201 });
}
```

`src/app/api/events/[id]/cook/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { cookEvent } from "@/lib/plan";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  cookEvent(db, session.user.householdId, Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Page** — `src/app/plan/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { listEvents } from "@/lib/plan";
import { listSlots } from "@/lib/slots";
import { listRecipes } from "@/lib/recipes";

export default async function PlanPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const events = listEvents(db, hid, "0000-01-01", "9999-12-31");
  const slots = listSlots(db, hid);
  const recipes = new Map(listRecipes(db, hid).map((r) => [r.id, r.name]));
  const slotName = new Map(slots.map((s) => [s.id, s.name]));
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Plan</h1>
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.date} · {slotName.get(e.slotId) ?? "?"} · {recipes.get(e.recipeId) ?? "?"} ·{" "}
            {e.servings} servings · <strong>{e.status}</strong>
          </li>
        ))}
      </ul>
      {events.length === 0 && <p>No planned meals. POST to /api/events.</p>}
    </main>
  );
}
```

- [ ] **Step 7: Commit** (controller): `git commit -m "feat: add meal plan, planned consumption, and cook action"`

---

## Task 7: Run-out prediction (SERIAL TAIL)

**Files:** `src/lib/predict.ts` (+ `src/lib/predict.test.ts`)

Depends on Task 4 (stock) and Task 6 (planned consumption).

- [ ] **Step 1: Failing test** — `src/lib/predict.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { predictRunout } from "@/lib/predict";

describe("predictRunout (pure)", () => {
  it("with no history, returns a point estimate (low==high==point) minus safety buffer", () => {
    // 1000g stock, planned 200g/day, no history variance, buffer 0 days
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 0, historyDays: 0, bufferDays: 0 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(5);
    expect(r.highDays).toBe(5);
  });

  it("applies the safety buffer to the actionable (low) estimate", () => {
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 0, historyDays: 0, bufferDays: 1 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(4); // buy a day earlier
  });

  it("with enough history, widens the range using stddev", () => {
    // rate 200 ± 50, enough history -> low uses rate+stddev (250), high uses rate-stddev (150)
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 50, historyDays: 14, bufferDays: 0 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(4);  // 1000/250
    expect(r.highDays).toBe(7); // floor(1000/150)
  });

  it("treats a zero consumption rate as never running out", () => {
    const r = predictRunout({ stock: 500, dailyRate: 0, dailyStdDev: 0, historyDays: 0, bufferDays: 0 });
    expect(r.pointDays).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/predict.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/predict.ts`:

```ts
export interface RunoutInput {
  stock: number;        // current canonical units on hand
  dailyRate: number;    // mean planned consumption per day
  dailyStdDev: number;  // std dev of daily consumption from history
  historyDays: number;  // how many days of cooked history informed the stddev
  bufferDays: number;   // safety buffer (days) the user wants
}

export interface RunoutResult {
  pointDays: number; // days until stock hits zero at the mean rate
  lowDays: number;   // earliest plausible run-out (when to act), buffer applied
  highDays: number;  // latest plausible run-out
}

const MIN_HISTORY_DAYS = 7; // below this, variance is untrustworthy -> collapse to point

export function predictRunout(input: RunoutInput): RunoutResult {
  const { stock, dailyRate, dailyStdDev, historyDays, bufferDays } = input;
  if (dailyRate <= 0) {
    return { pointDays: Infinity, lowDays: Infinity, highDays: Infinity };
  }
  const pointDays = Math.floor(stock / dailyRate);
  // collapse the range to the point estimate when history is too thin to trust
  const sigma = historyDays >= MIN_HISTORY_DAYS ? dailyStdDev : 0;
  const highRate = dailyRate + sigma;            // faster use -> sooner run-out
  const lowRate = Math.max(dailyRate - sigma, 1); // slower use -> later run-out (avoid /0)
  const lowDays = Math.max(Math.floor(stock / highRate) - bufferDays, 0);
  const highDays = Math.floor(stock / lowRate);
  return { pointDays, lowDays, highDays };
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/predict.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit** (controller): `git commit -m "feat: add run-out prediction (point estimate widening with history)"`

---

## Task 8: Shopping recommendation + checklist + purchase→restock (SERIAL TAIL)

**Files:** `src/lib/shopping.ts` (+ `src/lib/shopping.test.ts`), `src/app/api/shopping/route.ts`, `src/app/api/purchases/route.ts`, `src/app/shopping/page.tsx`

Depends on Task 4 (stock), Task 6 (planned consumption), Catalog products/preferences.

- [ ] **Step 1: Failing test** — `src/lib/shopping.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
let shopId: number;
let productId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
  shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, {
    ingredientId: flourId, shopId, branchId: null, name: "AP Flour 25lb",
    packSize: 11340, priority: 1, url: null,
  }).id;
});

describe("recordPurchase", () => {
  it("buying 1 product restocks packSize*qty into inventory and records the purchase + price", () => {
    recordPurchase(db, hid, { productId, quantity: 1, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(11340);
    const purchases = db.select().from(schema.purchases)
      .where(eq(schema.purchases.householdId, hid)).all();
    expect(purchases).toHaveLength(1);
    const prices = db.select().from(schema.prices)
      .where(eq(schema.prices.productId, productId)).all();
    expect(prices[0].cents).toBe(1299);
  });

  it("buying 2 adds 2x the pack size", () => {
    recordPurchase(db, hid, { productId, quantity: 2, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(22680);
  });
});

import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Confirm fail** — `npm test -- src/lib/shopping.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/shopping.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { recordMovement } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface PurchaseInput { productId: number; quantity: number; cents: number; }

/** Record a purchase: insert purchase row, append a price observation, restock inventory. */
export function recordPurchase(db: Db, householdId: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [purchase] = tx.insert(schema.purchases)
      .values({ householdId, productId: input.productId, quantity: input.quantity, cents: input.cents })
      .returning().all();
    tx.insert(schema.prices).values({ productId: input.productId, cents: input.cents }).run();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId,
      delta: product.packSize * input.quantity, reason: "purchase", purchaseId: purchase.id,
    }).run();
    return purchase;
  });
}

export interface ShoppingLine {
  ingredientId: number; ingredientName: string;
  needed: number;        // canonical units short
  product: { id: number; name: string } | null; // top-priority available product
}

/**
 * For each ingredient short of `targetByIngredient`, pick the top-priority AVAILABLE
 * product and group the resulting lines by shop. Returns a shop -> lines map.
 */
export function buyRecommendation(
  db: Db, householdId: number,
  stockByIngredientMap: Map<number, number>,
  targetByIngredient: Map<number, number>,
): Map<string, ShoppingLine[]> {
  const result = new Map<string, ShoppingLine[]>();
  const ingredientRows = db.select().from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId)).all();
  const nameById = new Map(ingredientRows.map((i) => [i.id, i.name]));

  for (const [ingredientId, target] of targetByIngredient) {
    const have = stockByIngredientMap.get(ingredientId) ?? 0;
    const needed = target - have;
    if (needed <= 0) continue;
    const [product] = db.select().from(schema.products)
      .where(and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
        eq(schema.products.available, true),
      ))
      .orderBy(asc(schema.products.priority)).limit(1).all();
    const shop = product
      ? db.select().from(schema.shops).where(eq(schema.shops.id, product.shopId)).all()[0]
      : null;
    const shopKey = shop?.name ?? "Unassigned";
    const line: ShoppingLine = {
      ingredientId, ingredientName: nameById.get(ingredientId) ?? "?",
      needed, product: product ? { id: product.id, name: product.name } : null,
    };
    if (!result.has(shopKey)) result.set(shopKey, []);
    result.get(shopKey)!.push(line);
  }
  return result;
}
```

- [ ] **Step 4: Confirm pass** — `npm test -- src/lib/shopping.test.ts` → PASS (2 tests).

- [ ] **Step 5: API** — `src/app/api/purchases/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { recordPurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = Number(b?.productId);
  const quantity = Number(b?.quantity) || 1;
  const cents = b?.cents !== undefined ? Number(b.cents)
    : b?.dollars !== undefined ? dollarsToCents(Number(b.dollars)) : NaN;
  if (!productId || !Number.isFinite(cents) || cents < 0)
    return NextResponse.json({ error: "productId and cents/dollars required" }, { status: 400 });
  return NextResponse.json(
    recordPurchase(db, session.user.householdId, { productId, quantity, cents: Math.round(cents) }),
    { status: 201 });
}
```

`src/app/api/shopping/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient } from "@/lib/stock";
import { plannedConsumption } from "@/lib/plan";
import { buyRecommendation } from "@/lib/shopping";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = sp.get("to") ?? "9999-12-31";
  const stock = stockByIngredient(db, hid);
  const target = plannedConsumption(db, hid, from, to);
  const grouped = buyRecommendation(db, hid, stock, target);
  return NextResponse.json(Object.fromEntries(grouped));
}
```

- [ ] **Step 6: Page** — `src/app/shopping/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient } from "@/lib/stock";
import { plannedConsumption } from "@/lib/plan";
import { buyRecommendation } from "@/lib/shopping";

export default async function ShoppingPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const today = new Date().toISOString().slice(0, 10);
  const grouped = buyRecommendation(
    db, hid, stockByIngredient(db, hid), plannedConsumption(db, hid, today, "9999-12-31"),
  );
  const shops = [...grouped.entries()];
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Shopping list</h1>
      {shops.map(([shop, lines]) => (
        <section key={shop}>
          <h2>{shop}</h2>
          <ul>
            {lines.map((l) => (
              <li key={l.ingredientId}>
                {l.ingredientName}: need {l.needed} —{" "}
                {l.product ? l.product.name : "no product set"}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {shops.length === 0 && <p>Nothing to buy — plan some meals first.</p>}
    </main>
  );
}
```

- [ ] **Step 7: Commit** (controller): `git commit -m "feat: add shopping recommendation, checklist data, purchase->restock"`

---

## Task 9: Integration verification (SERIAL — last)

**Files:** none.

- [ ] **Step 1: Full suite + types + build**

Run: `npm test` → all pass (16 prior + recipes 2 + slots 2 + stock 3 + consumption 2 + plan 3 + predict 4 + shopping 2 = 34).
Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds; route list includes `/recipes`, `/plan`, `/shopping`, and the new API routes.

- [ ] **Step 2: End-to-end loop smoke test (with a logged-in session cookie)**

1. Create ingredient Flour (g, serving 50), shop Costco, product "AP Flour 25lb" packSize 11340 priority 1.
2. `POST /api/recipes` Bread: baseServings 2, ingredients [{flourId, 500}].
3. `POST /api/slots` Dinner.
4. `POST /api/events` date today, that slot + recipe, servings 2.
5. `POST /api/purchases` `{productId, quantity:1, dollars:12.99}` → `GET /api/stock` shows flour 11340.
6. `GET /api/shopping` → after the purchase, the planned 500g is covered, so Flour should NOT appear (need ≤ 0).
7. `POST /api/events/<id>/cook` → `GET /api/stock` shows flour 10840 (11340 − 500); the event shows `cooked`.

Document actual responses; only claim what was observed.

- [ ] **Step 3: Final commit** — `git commit -m "chore: kitchen-loop phase complete"`

---

## Self-Review Notes

- **Spec coverage:** Recipes w/ ingredients+steps+media+servings (T2). Configurable slots (T3). Planned vs cooked meal events sharing ONE formula — `consumptionForRecipe` is used by both `plannedConsumption` and `recordCooked` (T5/T6). Inventory derived from an append-only movement ledger; purchases add, cooking subtracts (T4/T5/T8). `predictRunout` point-estimate widening with history, collapsing below `MIN_HISTORY_DAYS`, plus safety buffer (T7). Shop-grouped buy recommendation off planned-minus-stock, top-priority available product (T8). Purchase→restock with price history (T8). ✓
- **One-formula invariant:** both planned and cooked paths call `consumptionForRecipe` — verified by `consumption.test.ts` (cook) and `plan.test.ts` (planned sum). Editing the past plan touches nothing in stock; only `cookEvent` writes movements, and it is idempotent (no-op if already cooked) — tested.
- **Parallelism:** T1 serial (schema). T2/T3/T4 parallel wave (disjoint files, no cross-imports — recipes, slots, stock each stand alone). T5→T6→T7→T8 serial tail (each imports the prior). T9 serial.
- **Money:** purchases/prices in integer cents; API accepts cents or dollars via `dollarsToCents`. Asserted in `shopping.test.ts` (1299).
- **Type consistency:** `consumptionForRecipe(recipe, servings)` signature identical across consumption/plan; `recordMovement`/`currentStock`/`stockByIngredient` names match across stock/consumption/shopping; Next 16 params are `Promise<{id}>` awaited everywhere.
- **Deferred (later phases / not built here):** weekly-template repetition UI, editing/deleting events via UI, branch-aware product selection in recommendation, learned variance computation feeding `predictRunout` (the function accepts `dailyStdDev`/`historyDays` now; the query that computes them from cooked history is a later enhancement — for now callers pass 0), receipt scanning, nutrition. The Costco importer is its own separate plan.
