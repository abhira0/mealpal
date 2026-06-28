# MealPal Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supply-side catalog — ingredients (with canonical units + serving mapping), shops, branches, products (with pack-size→canonical mapping and ranked preference), and price history — all scoped by `household_id`.

**Architecture:** Builds directly on the Foundation phase. Task 1 (serial) defines ALL catalog tables in `src/db/schema.ts` and generates one migration — this is the shared bedrock that cannot be edited concurrently. Tasks 2, 3, and 4 are mutually independent CRUD slices (ingredients; shops+branches; products+prices) that touch only their own files and can be dispatched in parallel. Each slice = a TDD-tested data-layer module + API routes + one minimal page. Money is stored as integer cents to avoid floating-point money bugs. A product's preference rank lives as a `priority` column on the product (no separate join table) and availability as a boolean — an ingredient's ranked preference list is just its products ordered by priority.

**Tech Stack:** Same as Foundation — Next.js 16, TypeScript, better-sqlite3, Drizzle ORM, Vitest. No new dependencies.

**Context for implementers:**
- DB client lives at `src/db/index.ts` exporting `db` and `schema`. Tables are defined in `src/db/schema.ts`.
- Data-layer modules follow the pattern in `src/lib/users.ts`: `type Db = BetterSQLite3Database<typeof schema>`, functions take `db` as the first argument, use `.returning().all()` for inserts, scope reads/writes by `householdId`.
- Tests use `makeTestDb()` from `src/test/db.ts` (in-memory SQLite with migrations applied). `foreign_keys` is ON, so a test must insert a `households` row before inserting rows that reference `household_id`.
- Auth/session carries `householdId` (number). API routes get it via `const session = await auth()` from `@/auth`, then `session.user.householdId`. Never import `@/db` or `@/auth` into middleware (see edge-runtime split).
- Migrations: `npm run db:generate` then `npm run db:migrate`. Tests: `npm test`. Type check: `npx tsc --noEmit`.

---

## File Structure

- `src/db/schema.ts` — MODIFY: add `ingredients`, `shops`, `branches`, `products`, `prices` tables.
- `src/lib/money.ts` — NEW: `dollarsToCents` / `centsToDollars` helpers (TDD).
- `src/lib/ingredients.ts` + `src/lib/ingredients.test.ts` — Slice A data layer.
- `src/app/api/ingredients/route.ts` + `src/app/api/ingredients/[id]/route.ts` — Slice A API.
- `src/app/ingredients/page.tsx` — Slice A minimal page.
- `src/lib/shops.ts` + `src/lib/shops.test.ts` — Slice B data layer (shops + branches).
- `src/app/api/shops/route.ts`, `src/app/api/branches/route.ts` — Slice B API.
- `src/app/shops/page.tsx` — Slice B minimal page.
- `src/lib/products.ts` + `src/lib/products.test.ts` — Slice C data layer (products + prices + preference ordering).
- `src/app/api/products/route.ts`, `src/app/api/products/[id]/price/route.ts` — Slice C API.
- `src/app/products/page.tsx` — Slice C minimal page.
- `src/test/fixtures.ts` — NEW (created in Task 1): `seedHousehold(db)` helper used by all slice tests.

---

## Task 1: Catalog schema + migration + test fixture (SERIAL — must complete before Tasks 2–4)

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/test/fixtures.ts`

- [ ] **Step 1: Add the catalog tables to the schema**

Append to `src/db/schema.ts` (keep the existing `households` and `users` tables and their imports; `sql` is added to the import from `drizzle-orm`):

```ts
import { sql } from "drizzle-orm";

export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  // canonical stock unit: one of 'g' | 'ml' | 'oz' | 'count'
  canonicalUnit: text("canonical_unit").notNull(),
  // optional: how many canonical units equal one serving (null = servings not defined)
  servingSize: integer("serving_size"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
});

export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  name: text("name").notNull(),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  // optional specific location; null = "the shop, any branch"
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  // how many of the ingredient's canonical units are in ONE unit of this product
  packSize: integer("pack_size").notNull(),
  // preference rank within the ingredient (lower = preferred). default 100.
  priority: integer("priority").notNull().default(100),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
  url: text("url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const prices = sqliteTable("prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  // money stored as integer cents — never floats
  cents: integer("cents").notNull(),
  observedAt: integer("observed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: a new `drizzle/0001_*.sql` is created and applied. Verify:

```bash
sqlite3 mealpal.db ".tables"
```

Expected output includes `ingredients`, `shops`, `branches`, `products`, `prices`.

- [ ] **Step 3: Create the shared test fixture**

Create `src/test/fixtures.ts`:

```ts
import { schema } from "@/db";
import type { TestDb } from "@/test/db";

/** Inserts a household and returns its id. Required before inserting scoped rows. */
export function seedHousehold(db: TestDb, name = "Test Home"): number {
  const [h] = db.insert(schema.households).values({ name }).returning().all();
  return h.id;
}
```

- [ ] **Step 4: Verify types and the existing suite still pass**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → the existing 5 tests still pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add catalog schema (ingredients, shops, branches, products, prices)"
```

---

## Task 2: Ingredients slice (PARALLEL-SAFE after Task 1)

**Files:**
- Create: `src/lib/ingredients.ts`
- Test: `src/lib/ingredients.test.ts`
- Create: `src/app/api/ingredients/route.ts`, `src/app/api/ingredients/[id]/route.ts`
- Create: `src/app/ingredients/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ingredients.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import {
  createIngredient,
  listIngredients,
  updateIngredient,
} from "@/lib/ingredients";

let db: TestDb;
let hid: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
});

describe("ingredients", () => {
  it("creates and lists ingredients scoped to a household", () => {
    createIngredient(db, hid, { name: "Flour", canonicalUnit: "g", servingSize: 50 });
    const other = seedHousehold(db, "Other");
    createIngredient(db, other, { name: "Sugar", canonicalUnit: "g", servingSize: null });

    const mine = listIngredients(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Flour");
    expect(mine[0].servingSize).toBe(50);
  });

  it("updates an ingredient within the household", () => {
    const ing = createIngredient(db, hid, {
      name: "Milk",
      canonicalUnit: "ml",
      servingSize: 240,
    });
    const updated = updateIngredient(db, hid, ing.id, { name: "Whole Milk" });
    expect(updated?.name).toBe("Whole Milk");
  });

  it("does not update an ingredient from another household", () => {
    const other = seedHousehold(db, "Other");
    const ing = createIngredient(db, other, {
      name: "Oats",
      canonicalUnit: "g",
      servingSize: 40,
    });
    const result = updateIngredient(db, hid, ing.id, { name: "Hacked" });
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/ingredients.test.ts`
Expected: FAIL — cannot resolve `@/lib/ingredients`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/ingredients.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface IngredientInput {
  name: string;
  canonicalUnit: string;
  servingSize: number | null;
}

export function createIngredient(db: Db, householdId: number, input: IngredientInput) {
  const [row] = db
    .insert(schema.ingredients)
    .values({ householdId, ...input })
    .returning()
    .all();
  return row;
}

export function listIngredients(db: Db, householdId: number) {
  return db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all();
}

export function updateIngredient(
  db: Db,
  householdId: number,
  id: number,
  patch: Partial<IngredientInput>,
) {
  const [row] = db
    .update(schema.ingredients)
    .set(patch)
    .where(
      and(
        eq(schema.ingredients.id, id),
        eq(schema.ingredients.householdId, householdId),
      ),
    )
    .returning()
    .all();
  return row; // undefined if no row matched the household scope
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/ingredients.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the API routes**

Create `src/app/api/ingredients/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createIngredient, listIngredients } from "@/lib/ingredients";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listIngredients(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const canonicalUnit = body?.canonicalUnit?.trim();
  const servingSize =
    body?.servingSize === null || body?.servingSize === undefined
      ? null
      : Number(body.servingSize);
  if (!name || !["g", "ml", "oz", "count"].includes(canonicalUnit)) {
    return NextResponse.json(
      { error: "name and a canonicalUnit of g/ml/oz/count are required." },
      { status: 400 },
    );
  }
  const row = createIngredient(db, session.user.householdId, {
    name,
    canonicalUnit,
    servingSize,
  });
  return NextResponse.json(row, { status: 201 });
}
```

Create `src/app/api/ingredients/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updateIngredient } from "@/lib/ingredients";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const row = updateIngredient(db, session.user.householdId, Number(id), {
    ...(body?.name !== undefined ? { name: String(body.name).trim() } : {}),
    ...(body?.canonicalUnit !== undefined
      ? { canonicalUnit: String(body.canonicalUnit).trim() }
      : {}),
    ...(body?.servingSize !== undefined
      ? { servingSize: body.servingSize === null ? null : Number(body.servingSize) }
      : {}),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
```

- [ ] **Step 6: Write the minimal page**

Create `src/app/ingredients/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { listIngredients } from "@/lib/ingredients";

export default async function IngredientsPage() {
  const session = await auth();
  const rows = session ? listIngredients(db, session.user.householdId) : [];
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Ingredients</h1>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.name} — {r.canonicalUnit}
            {r.servingSize ? ` (1 serving = ${r.servingSize} ${r.canonicalUnit})` : ""}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p>No ingredients yet. POST to /api/ingredients to add one.</p>}
    </main>
  );
}
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test -- src/lib/ingredients.test.ts` → PASS.

```bash
git add -A
git commit -m "feat: add ingredients CRUD (data layer, API, page)"
```

---

## Task 3: Shops + branches slice (PARALLEL-SAFE after Task 1)

**Files:**
- Create: `src/lib/shops.ts`
- Test: `src/lib/shops.test.ts`
- Create: `src/app/api/shops/route.ts`, `src/app/api/branches/route.ts`
- Create: `src/app/shops/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shops.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import {
  createShop,
  listShops,
  createBranch,
  listBranches,
} from "@/lib/shops";

let db: TestDb;
let hid: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
});

describe("shops & branches", () => {
  it("creates and lists shops scoped to a household", () => {
    createShop(db, hid, "Costco");
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Walmart");
    const mine = listShops(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Costco");
  });

  it("creates branches under a shop and lists them by shop", () => {
    const shop = createShop(db, hid, "Costco");
    createBranch(db, hid, shop.id, "Seattle");
    createBranch(db, hid, shop.id, "Kirkland");
    const branches = listBranches(db, hid, shop.id);
    expect(branches.map((b) => b.name).sort()).toEqual(["Kirkland", "Seattle"]);
  });

  it("does not list another household's shops", () => {
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Target");
    expect(listShops(db, hid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/shops.test.ts`
Expected: FAIL — cannot resolve `@/lib/shops`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shops.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export function createShop(db: Db, householdId: number, name: string) {
  const [row] = db
    .insert(schema.shops)
    .values({ householdId, name })
    .returning()
    .all();
  return row;
}

export function listShops(db: Db, householdId: number) {
  return db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.householdId, householdId))
    .all();
}

export function createBranch(
  db: Db,
  householdId: number,
  shopId: number,
  name: string,
) {
  const [row] = db
    .insert(schema.branches)
    .values({ householdId, shopId, name })
    .returning()
    .all();
  return row;
}

export function listBranches(db: Db, householdId: number, shopId: number) {
  return db
    .select()
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.householdId, householdId),
        eq(schema.branches.shopId, shopId),
      ),
    )
    .all();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/shops.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the API routes**

Create `src/app/api/shops/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createShop, listShops } from "@/lib/shops";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listShops(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  return NextResponse.json(createShop(db, session.user.householdId, name), { status: 201 });
}
```

Create `src/app/api/branches/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createBranch, listBranches } from "@/lib/shops";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const shopId = Number(new URL(req.url).searchParams.get("shopId"));
  if (!shopId) return NextResponse.json({ error: "shopId query param required." }, { status: 400 });
  return NextResponse.json(listBranches(db, session.user.householdId, shopId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const shopId = Number(body?.shopId);
  const name = body?.name?.trim();
  if (!shopId || !name)
    return NextResponse.json({ error: "shopId and name are required." }, { status: 400 });
  return NextResponse.json(
    createBranch(db, session.user.householdId, shopId, name),
    { status: 201 },
  );
}
```

- [ ] **Step 6: Write the minimal page**

Create `src/app/shops/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { listShops, listBranches } from "@/lib/shops";

export default async function ShopsPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const shops = listShops(db, hid);
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Shops</h1>
      <ul>
        {shops.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            <ul>
              {listBranches(db, hid, s.id).map((b) => (
                <li key={b.id}>{b.name}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {shops.length === 0 && <p>No shops yet. POST to /api/shops to add one.</p>}
    </main>
  );
}
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test -- src/lib/shops.test.ts` → PASS.

```bash
git add -A
git commit -m "feat: add shops and branches CRUD (data layer, API, page)"
```

---

## Task 4: Products + prices + preference slice (PARALLEL-SAFE after Task 1)

**Files:**
- Create: `src/lib/money.ts`, `src/lib/products.ts`
- Test: `src/lib/money.test.ts`, `src/lib/products.test.ts`
- Create: `src/app/api/products/route.ts`, `src/app/api/products/[id]/price/route.ts`
- Create: `src/app/products/page.tsx`

- [ ] **Step 1: Write the failing money test**

Create `src/lib/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars } from "@/lib/money";

describe("money", () => {
  it("converts dollars to integer cents without float drift", () => {
    expect(dollarsToCents(12.99)).toBe(1299);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(Number.isInteger(dollarsToCents(19.99))).toBe(true);
  });
  it("converts cents back to a dollar number", () => {
    expect(centsToDollars(1299)).toBe(12.99);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/money.test.ts`
Expected: FAIL — cannot resolve `@/lib/money`.

- [ ] **Step 3: Implement money helpers**

Create `src/lib/money.ts`:

```ts
/** Convert a dollar amount to integer cents, rounding to avoid float drift. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/money.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing products test**

Create `src/lib/products.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import {
  createProduct,
  addPrice,
  listProductsForIngredient,
  latestPrice,
} from "@/lib/products";

let db: TestDb;
let hid: number;
let ingredientId: number;
let shopId: number;

beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  ingredientId = db
    .insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning()
    .all()[0].id;
  shopId = db
    .insert(schema.shops)
    .values({ householdId: hid, name: "Costco" })
    .returning()
    .all()[0].id;
});

describe("products & prices", () => {
  it("creates a product with a pack-size and returns it for its ingredient", () => {
    const p = createProduct(db, hid, {
      ingredientId,
      shopId,
      branchId: null,
      name: "Kirkland AP Flour 25lb",
      packSize: 11340,
      priority: 1,
      url: null,
    });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);
    expect(list[0].packSize).toBe(11340);
  });

  it("orders an ingredient's products by priority (preference list)", () => {
    createProduct(db, hid, {
      ingredientId, shopId, branchId: null, name: "B", packSize: 1000, priority: 3, url: null,
    });
    createProduct(db, hid, {
      ingredientId, shopId, branchId: null, name: "A", packSize: 1000, priority: 1, url: null,
    });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("records price history and reports the latest price in cents", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, branchId: null, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    addPrice(db, p.id, 1299, new Date("2026-01-01"));
    addPrice(db, p.id, 1349, new Date("2026-06-01"));
    expect(latestPrice(db, p.id)?.cents).toBe(1349);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- src/lib/products.test.ts`
Expected: FAIL — cannot resolve `@/lib/products`.

- [ ] **Step 7: Implement products data layer**

Create `src/lib/products.ts`:

```ts
import { and, asc, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface ProductInput {
  ingredientId: number;
  shopId: number;
  branchId: number | null;
  name: string;
  packSize: number;
  priority: number;
  url: string | null;
}

export function createProduct(db: Db, householdId: number, input: ProductInput) {
  const [row] = db
    .insert(schema.products)
    .values({ householdId, ...input })
    .returning()
    .all();
  return row;
}

/** An ingredient's products in preference order (lowest priority number first). */
export function listProductsForIngredient(
  db: Db,
  householdId: number,
  ingredientId: number,
) {
  return db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
      ),
    )
    .orderBy(asc(schema.products.priority))
    .all();
}

export function addPrice(db: Db, productId: number, cents: number, observedAt?: Date) {
  const [row] = db
    .insert(schema.prices)
    .values({ productId, cents, ...(observedAt ? { observedAt } : {}) })
    .returning()
    .all();
  return row;
}

export function latestPrice(db: Db, productId: number) {
  const [row] = db
    .select()
    .from(schema.prices)
    .where(eq(schema.prices.productId, productId))
    .orderBy(desc(schema.prices.observedAt))
    .limit(1)
    .all();
  return row;
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- src/lib/products.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Write the API routes**

Create `src/app/api/products/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createProduct, listProductsForIngredient } from "@/lib/products";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ingredientId = Number(new URL(req.url).searchParams.get("ingredientId"));
  if (!ingredientId)
    return NextResponse.json({ error: "ingredientId query param required." }, { status: 400 });
  return NextResponse.json(
    listProductsForIngredient(db, session.user.householdId, ingredientId),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const shopId = Number(b?.shopId);
  const name = b?.name?.trim();
  const packSize = Number(b?.packSize);
  if (!ingredientId || !shopId || !name || !packSize || packSize <= 0) {
    return NextResponse.json(
      { error: "ingredientId, shopId, name, and a positive packSize are required." },
      { status: 400 },
    );
  }
  const row = createProduct(db, session.user.householdId, {
    ingredientId,
    shopId,
    branchId: b?.branchId ? Number(b.branchId) : null,
    name,
    packSize,
    priority: b?.priority !== undefined ? Number(b.priority) : 100,
    url: b?.url?.trim() || null,
  });
  return NextResponse.json(row, { status: 201 });
}
```

Create `src/app/api/products/[id]/price/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addPrice } from "@/lib/products";
import { dollarsToCents } from "@/lib/money";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  // accept either {cents} or {dollars}
  const cents =
    b?.cents !== undefined ? Number(b.cents) : b?.dollars !== undefined ? dollarsToCents(Number(b.dollars)) : NaN;
  if (!Number.isFinite(cents) || cents < 0) {
    return NextResponse.json({ error: "Provide cents or dollars >= 0." }, { status: 400 });
  }
  const observedAt = b?.observedAt ? new Date(b.observedAt) : undefined;
  return NextResponse.json(addPrice(db, Number(id), Math.round(cents), observedAt), {
    status: 201,
  });
}
```

- [ ] **Step 10: Write the minimal page**

Create `src/app/products/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { listIngredients } from "@/lib/ingredients";
import { listProductsForIngredient, latestPrice } from "@/lib/products";
import { centsToDollars } from "@/lib/money";

export default async function ProductsPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const ingredients = listIngredients(db, hid);
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Products by ingredient (preference order)</h1>
      {ingredients.map((ing) => {
        const products = listProductsForIngredient(db, hid, ing.id);
        return (
          <section key={ing.id}>
            <h2>{ing.name}</h2>
            <ol>
              {products.map((p) => {
                const price = latestPrice(db, p.id);
                return (
                  <li key={p.id}>
                    {p.name} — pack {p.packSize} {ing.canonicalUnit}
                    {price ? ` — $${centsToDollars(price.cents).toFixed(2)}` : " — no price"}
                    {p.available ? "" : " (unavailable)"}
                  </li>
                );
              })}
            </ol>
            {products.length === 0 && <p>No products for this ingredient.</p>}
          </section>
        );
      })}
      {ingredients.length === 0 && <p>Add ingredients first.</p>}
    </main>
  );
}
```

Note: this page imports `listIngredients` from `@/lib/ingredients` (Task 2). If Task 2 and Task 4 run in parallel, the page will not type-check until Task 2's module exists — that import is the one cross-slice coupling. Acceptable: the data-layer + API tests (Steps 1–9) are fully independent; only this read-only page touches the ingredients module.

- [ ] **Step 11: Verify and commit**

Run: `npx tsc --noEmit` → no errors (requires Task 2's `src/lib/ingredients.ts` to exist).
Run: `npm test -- src/lib/products.test.ts src/lib/money.test.ts` → PASS.

```bash
git add -A
git commit -m "feat: add products, prices, and preference ordering (data layer, API, page)"
```

---

## Task 5: Integration verification (SERIAL — after Tasks 2–4 merge)

**Files:** none (verification).

- [ ] **Step 1: Full type check and test suite**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all tests pass (Foundation 5 + ingredients 3 + shops 3 + money 2 + products 3 = 16).

- [ ] **Step 2: End-to-end API smoke test**

Start the app (`npm run dev`, note the port), register/login to get a session cookie (reuse the Foundation curl flow to obtain the cookie), then with that cookie:

1. `POST /api/ingredients` `{"name":"Flour","canonicalUnit":"g","servingSize":50}` → 201, returns an id.
2. `POST /api/shops` `{"name":"Costco"}` → 201, returns an id.
3. `POST /api/products` `{"ingredientId":<id>,"shopId":<id>,"name":"Kirkland AP Flour 25lb","packSize":11340,"priority":1}` → 201.
4. `POST /api/products/<productId>/price` `{"dollars":12.99}` → 201, and the returned `cents` is `1299`.
5. `GET /api/products?ingredientId=<id>` → 200, the product is present.
6. Visit `/products` in a browser-equivalent GET → the ingredient lists its product at `$12.99`.

Document the actual responses. Only claim what was observed.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: catalog phase complete"
```

---

## Self-Review Notes

- **Spec coverage:** ingredients w/ canonical unit + serving mapping (Task 2); shops + nullable-branch (Task 3, `branchId` nullable on products); products w/ pack-size→canonical mapping + ranked `priority` preference + `available` flag + `url` for the future importer (Task 4); timestamped price history in integer cents (Task 4). All scoped by `householdId` and verified by cross-household tests. ✓
- **Parallelism:** Task 1 (schema/migration/fixture) is the serial bedrock. Tasks 2, 3, 4 touch disjoint files and are parallel-safe; the single cross-slice coupling is the read-only `/products` page importing `listIngredients` — noted in Task 4 Step 10. Task 5 is serial integration after merge.
- **Money safety:** prices are integer cents end to end; `dollarsToCents` rounds; the products test asserts `1299` for `$12.99`. Self-check lives in `money.test.ts`.
- **Type consistency:** `householdId: number` everywhere; `ProductInput`/`IngredientInput` field names match between lib, tests, and API routes; Next 16 dynamic route params are `Promise<{id}>` and awaited (matches the framework version installed in Foundation).
- **Deferred:** product edit/delete, branch deletion, preference re-ordering UI, "cheapest available" selection (that logic belongs to the Shopping phase, not Catalog). Availability is a stored flag here; it gets consumed by the recommendation engine later.
