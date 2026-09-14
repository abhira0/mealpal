import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { addEvent } from "@/lib/plan";
import { packBatch, eatFromBatch } from "@/lib/batches";
import {
  findRecipe, getAgenda, getDay, getDayIngredients, getShopping, getStock,
  getWeek, resolveHousehold,
} from "@/mcp/tools";

let db: TestDb;
let hid: number;
let oilId: number;
let slotId: number;
let productId: number;
const DAY = "2026-07-01";

beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  oilId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Oil", canonicalUnit: "ml" }).returning().all()[0].id;
  slotId = db.insert(schema.mealSlots)
    .values({ householdId: hid, name: "Dinner", timeOfDay: "18:00" }).returning().all()[0].id;
  const shopId = db.insert(schema.shops)
    .values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  // 9 kcal/ml, all fat — the classic macro offender, so assertions read clearly.
  productId = db.insert(schema.products).values({
    householdId: hid, ingredientId: oilId, shopId, name: "Olive Oil",
    packSize: 1000, priority: 1, calories: 9, fatG: 1, proteinG: 0, carbsG: 0,
  }).returning().all()[0].id;
  // No nutrition_goals row: getGoals falls back to DEFAULT_GOALS
  // (2000 kcal / 150p / 220c / 65f), which is what these assertions use.
  // The table can't be seeded here anyway — drizzle/0011_add_nutrition_goals.sql
  // collides with 0011_demo_seed in the journal, so it never runs on a fresh db.
});

describe("resolveHousehold", () => {
  it("uses the only household when there is exactly one", () => {
    expect(resolveHousehold(db)).toBe(hid);
  });

  it("requires PLATR_HOUSEHOLD_ID when there are several", () => {
    seedHousehold(db, "Other");
    expect(() => resolveHousehold(db)).toThrow(/2 households/);
    expect(resolveHousehold(db, String(hid))).toBe(hid);
  });

  it("rejects an id that isn't in this database", () => {
    expect(() => resolveHousehold(db, "999")).toThrow(/not found/);
  });
});

describe("getDay", () => {
  it("reports totals against goals and flags meals not yet eaten", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    addEvent(db, hid, { date: DAY, slotId, productId, servings: 100 }); // planned, 100ml

    const out = getDay(db, hid, DAY);
    expect(out.date).toBe(DAY);
    expect(out.meals).toHaveLength(1);
    expect(out.meals[0].eaten).toBe(false);
    // planned meals contribute to the projection, not to what's been eaten
    expect(out.totals.calories.actual).toBe(0);
    expect(out.ifAllPlannedEaten.calories.actual).toBe(900);
    expect(out.totals.calories.goal).toBe(2000);
  });

  it("counts a batch serving eaten, with delta and pctOfGoal against the goal", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Curry", cookedDate: DAY, mealsTotal: 2,
      items: [{ productId, amount: 100 }],
    });
    eatFromBatch(db, hid, batch.id, DAY);

    const out = getDay(db, hid, DAY);
    expect(out.meals[0].name).toBe("Curry");
    expect(out.meals[0].eaten).toBe(true);
    expect(out.totals.calories.actual).toBe(900);
    expect(out.totals.calories.delta).toBe(-1100);
    expect(out.totals.fatG.actual).toBe(100);
    expect(out.totals.fatG.delta).toBe(35); // 100g vs the 65g default goal
    expect(out.totals.fatG.pctOfGoal).toBe(154);
  });
});

describe("getDayIngredients", () => {
  it("sorts by the requested nutrient and includes batch meals", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Curry", cookedDate: DAY, mealsTotal: 2,
      items: [{ productId, amount: 100 }],
    });
    eatFromBatch(db, hid, batch.id, DAY);

    const out = getDayIngredients(db, hid, DAY, "fatG");
    expect(out.sortedBy).toBe("fatG");
    expect(out.ingredients).toHaveLength(1);
    expect(out.ingredients[0]).toMatchObject({
      ingredient: "Oil", product: "Olive Oil", qty: 100, unit: "ml", fatG: 100,
    });
  });

  it("reconciles with getDay totals — the breakdown must explain the number", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Curry", cookedDate: DAY, mealsTotal: 2,
      items: [{ productId, amount: 100 }],
    });
    eatFromBatch(db, hid, batch.id, DAY);

    const summed = getDayIngredients(db, hid, DAY).ingredients
      .reduce((n, i) => n + i.calories, 0);
    expect(summed).toBe(getDay(db, hid, DAY).totals.calories.actual);
  });
});

describe("getWeek", () => {
  it("averages over days with meals only, so a partial week reads correctly", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Curry", cookedDate: DAY, mealsTotal: 2,
      items: [{ productId, amount: 100 }],
    });
    eatFromBatch(db, hid, batch.id, DAY);

    const out = getWeek(db, hid, DAY);
    expect(out.byDay).toHaveLength(7);
    expect(out.daysWithMeals).toBe(1);
    // one 900 kcal day averages to 900, not 900/7
    expect(out.dailyAverage.calories.actual).toBe(900);
  });
});

describe("getAgenda", () => {
  it("returns the requested span with batch backing and remaining servings", () => {
    recordPurchase(db, hid, { productId, quantity: 1 });
    packBatch(db, hid, {
      slotId, label: "Curry", cookedDate: DAY, mealsTotal: 3,
      items: [{ productId, amount: 100 }],
    });

    const out = getAgenda(db, hid, DAY, 3);
    expect(out.from).toBe(DAY);
    expect(out.to).toBe("2026-07-03");
    expect(out.days).toHaveLength(3);
    expect(out.batches).toEqual([
      expect.objectContaining({ label: "Curry", servingsLeft: 3, servingsTotal: 3 }),
    ]);
  });
});

describe("getStock", () => {
  it("lists stock on hand and hides zeroed ingredients by default", () => {
    recordPurchase(db, hid, { productId, quantity: 1 }); // 1 pack × 1000ml

    const out = getStock(db, hid);
    expect(out.items).toEqual([
      expect.objectContaining({ ingredient: "Oil", qty: 1000, unit: "ml" }),
    ]);

    const empty = db.insert(schema.ingredients)
      .values({ householdId: hid, name: "Salt", canonicalUnit: "g" }).returning().all()[0];
    expect(getStock(db, hid).items.map((i) => i.ingredient)).not.toContain("Salt");
    expect(getStock(db, hid, true).items.map((i) => i.ingredient)).toContain(empty.name);
  });
});

describe("getShopping", () => {
  it("groups needed items by shop", () => {
    const recipe = createRecipe(db, hid, {
      name: "Fry", baseServings: 1, notes: null,
      ingredients: [{ ingredientId: oilId, amount: 50 }], steps: [], media: [],
    });
    // planned meal with nothing in stock → it must show up on the list
    addEvent(db, hid, { date: new Date().toISOString().slice(0, 10), slotId, recipeId: recipe.id, servings: 1 });

    const out = getShopping(db, hid, 7);
    expect(out.horizonDays).toBe(7);
    const costco = out.byShop.find((s) => s.shop === "Costco");
    expect(costco?.lines).toEqual([
      expect.objectContaining({ item: "Oil", needed: 50, product: "Olive Oil", packSize: 1000 }),
    ]);
    // Olive Oil has no priceCents and no priced purchase history — cost is
    // unknowable, so the estimate must stay null rather than silently read as $0.
    expect(costco?.lines[0].estCents).toBeNull();
    expect(costco?.estCents).toBeNull();
    expect(out.estTotalCents).toBeNull();
  });

  it("estimates cost from the product's price once one is on file", () => {
    db.update(schema.products).set({ priceCents: 500 }).where(eq(schema.products.id, productId)).run();
    const recipe = createRecipe(db, hid, {
      name: "Fry", baseServings: 1, notes: null,
      ingredients: [{ ingredientId: oilId, amount: 1500 }], steps: [], media: [],
    });
    addEvent(db, hid, { date: new Date().toISOString().slice(0, 10), slotId, recipeId: recipe.id, servings: 1 });

    const out = getShopping(db, hid, 7);
    const costco = out.byShop.find((s) => s.shop === "Costco")!;
    // 1500ml needed / 1000ml packs -> 2 packs @ $5.00 = $10.00
    expect(costco.lines[0].estCents).toBe(1000);
    expect(costco.estCents).toBe(1000);
    expect(out.estTotalCents).toBe(1000);
  });
});

describe("findRecipe", () => {
  beforeEach(() => {
    createRecipe(db, hid, {
      name: "Mushroom Biryani", baseServings: 4, notes: null,
      ingredients: [{ ingredientId: oilId, amount: 40 }], steps: [{ text: "Fry" }], media: [],
    });
  });

  it("matches case-insensitively and scales ingredients per serving", () => {
    const out = findRecipe(db, hid, "biryani");
    expect(out.found).toBe(true);
    expect(out.name).toBe("Mushroom Biryani");
    expect(out.baseServings).toBe(4);
    expect(out.ingredients?.[0]).toMatchObject({ name: "Oil", amountPerServing: 10 }); // 40 / 4
    expect(out.perServing?.calories).toBe(90); // 10ml × 9 kcal
    expect(out.steps).toEqual(["Fry"]);
  });

  it("returns candidates when the query is ambiguous", () => {
    createRecipe(db, hid, {
      name: "Chicken Biryani", baseServings: 2, notes: null,
      ingredients: [], steps: [], media: [],
    });
    const out = findRecipe(db, hid, "biryani");
    expect(out.found).toBe(false);
    expect(out.ambiguous).toHaveLength(2);
  });

  it("prefers an exact name match over the substring it is contained in", () => {
    createRecipe(db, hid, {
      name: "Biryani", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    });
    expect(findRecipe(db, hid, "Biryani")).toMatchObject({ found: true, name: "Biryani" });
  });

  it("lists every recipe name when nothing matches, so the model can retry", () => {
    const out = findRecipe(db, hid, "lasagna");
    expect(out.found).toBe(false);
    expect(out.availableRecipes).toEqual(["Mushroom Biryani"]);
  });
});
