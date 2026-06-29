import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { recordCooked, unstockedIngredients } from "@/lib/consumption";
import { dayNutrition, scorecards, zeroNutrients, mondayOf, macroSplit, dayIngredientTable, weekIngredientTable } from "@/lib/nutrition";
import { createVariant } from "@/lib/variants";
import { logEaten } from "@/lib/eaten";
import { createProduct } from "@/lib/products";
import { addEvent } from "@/lib/plan";

let db: TestDb;
let hid: number;
let flourId: number;
let slotId: number;

// flour: 2 kcal/g, 0.1g protein/g. 500g per (baseServings=1) recipe.
function flourProduct(opts: { calories: number | null }) {
  const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
  return db.insert(schema.products).values({
    householdId: hid, ingredientId: flourId, shopId, name: "Brand A", packSize: 1000, priority: 1,
    calories: opts.calories, proteinG: opts.calories == null ? null : 0.1,
  }).returning().all()[0].id;
}

function bread() {
  return createRecipe(db, hid, {
    name: "Bread", baseServings: 1, notes: null,
    ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
  });
}

function event(recipeId: number, status: "planned" | "cooked" = "planned") {
  return db.insert(schema.mealEvents)
    .values({ householdId: hid, date: "2026-07-01", slotId, recipeId, servings: 1, status })
    .returning().all()[0];
}

beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients).values({ householdId: hid, name: "Flour", canonicalUnit: "g" }).returning().all()[0].id;
  slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Dinner" }).returning().all()[0].id;
});

describe("dayNutrition", () => {
  it("planned meal estimates from the preferred product (per canonical unit)", () => {
    flourProduct({ calories: 2 });
    event(bread().id, "planned");
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.meals).toHaveLength(1);
    expect(day.meals[0].estimate).toBe(true);
    expect(day.total.calories).toBe(1000); // 500g * 2 kcal/g
    expect(day.total.proteinG).toBeCloseTo(50); // 500g * 0.1
    expect(day.missing).toEqual([]);
  });

  it("cooked meal is exact, from the actual product the cook recorded", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 1 }); // +1000g on pid
    const ev = event(bread().id, "cooked");
    recordCooked(db, hid, ev.recipeId!, ev.servings, ev.id); // -500g attributed to pid
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.meals[0].estimate).toBe(false);
    expect(day.total.calories).toBe(1000);
  });

  it("flags ingredients whose product has no nutrition, and undercounts", () => {
    flourProduct({ calories: null }); // photo not yet read into numbers
    event(bread().id, "planned");
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(0);
    expect(day.missing).toEqual(["Flour"]);
  });

  it("counts a product with nutrition filled in but no calories (e.g. protein only)", () => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    db.insert(schema.products).values({
      householdId: hid, ingredientId: flourId, shopId, name: "Brand A", packSize: 1000, priority: 1,
      calories: null, proteinG: 0.1, // manually saved protein, calories left blank
    }).returning().all();
    event(bread().id, "planned");
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.proteinG).toBeCloseTo(50); // 500g * 0.1
    expect(day.missing).toEqual([]); // not flagged as missing
  });
});

describe("cook block", () => {
  it("blocks cooking when an ingredient has no stock", () => {
    flourProduct({ calories: 2 });
    const ev = event(bread().id, "planned"); // nothing purchased → no stock
    expect(unstockedIngredients(db, hid, ev.id)).toEqual(["Flour"]);
  });

  it("allows cooking once every ingredient is in stock", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    const ev = event(bread().id, "planned");
    expect(unstockedIngredients(db, hid, ev.id)).toEqual([]);
  });
});

describe("scorecards", () => {
  const pass = (n: ReturnType<typeof zeroNutrients>, key: string) =>
    scorecards(n).find((c) => c.key === key)!.pass;

  it("passes a lean, low-sodium, high-protein day", () => {
    // cal = 480+320+270 = 1070; protein 45%, carbs 30% (not low-carb), sat fat 4%, sugar 2%
    const n = { ...zeroNutrients(), proteinG: 120, carbsG: 80, fatG: 30, satFatG: 5, sodiumMg: 1500, addedSugarG: 5 };
    expect(pass(n, "heartHealthy")).toBe(true);
    expect(pass(n, "highProtein")).toBe(true);
    expect(pass(n, "lowCarb")).toBe(false);
  });

  it("fails heart-healthy on high sodium", () => {
    const n = { ...zeroNutrients(), proteinG: 100, carbsG: 100, fatG: 40, satFatG: 6, sodiumMg: 3000, addedSugarG: 5 };
    expect(pass(n, "heartHealthy")).toBe(false);
  });

  it("passes low-carb when carbs are under a quarter of calories", () => {
    const n = { ...zeroNutrients(), proteinG: 150, carbsG: 30, fatG: 80 };
    expect(pass(n, "lowCarb")).toBe(true);
  });

  it("passes nothing on an empty day (zero calories)", () => {
    expect(scorecards(zeroNutrients()).every((c) => !c.pass)).toBe(true);
  });
});

describe("macroSplit", () => {
  it("splits calories across macros (4/4/9) and sums to ~100", () => {
    const s = macroSplit({ ...zeroNutrients(), carbsG: 100, fatG: 100, proteinG: 100 });
    // cal = 400 + 900 + 400 = 1700
    expect(Math.round(s.carbs)).toBe(24);
    expect(Math.round(s.fat)).toBe(53);
    expect(Math.round(s.protein)).toBe(24);
    expect(Math.round(s.carbs + s.fat + s.protein)).toBe(100);
  });
  it("is all zeros for an empty day", () => {
    expect(macroSplit(zeroNutrients())).toEqual({ carbs: 0, fat: 0, protein: 0 });
  });
});

describe("weekIngredientTable", () => {
  it("sums a planned ingredient's usage across the days of the week", () => {
    flourProduct({ calories: 2 });
    const r = bread().id;
    // two planned bread events in the same Mon–Sun week (2026-06-29 .. 07-05)
    db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-06-30", slotId, recipeId: r, servings: 1, status: "planned" }).run();
    db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-07-02", slotId, recipeId: r, servings: 1, status: "planned" }).run();
    const day = dayIngredientTable(db, hid, "2026-06-30");
    expect(day.find((x) => x.name === "Flour")!.qty).toBe(500);
    const week = weekIngredientTable(db, hid, mondayOf("2026-06-30"));
    expect(week.find((x) => x.name === "Flour")!.qty).toBe(1000); // 500 + 500
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the week (June 2026 starts on a Monday)", () => {
    expect(mondayOf("2026-06-29")).toBe("2026-06-29"); // a Monday
    expect(mondayOf("2026-07-01")).toBe("2026-06-29"); // Wed → that Monday
    expect(mondayOf("2026-06-28")).toBe("2026-06-22"); // Sun → prior Monday
  });
});

describe("dayNutrition includes the eat-log", () => {
  let eatDb: TestDb;
  let eatHid: number;
  let eatProductId: number;

  beforeEach(() => {
    eatDb = makeTestDb();
    eatHid = seedHousehold(eatDb);
    const ingId = eatDb.insert(schema.ingredients).values({ householdId: eatHid, name: "Trail Mix", canonicalUnit: "count" }).returning().all()[0].id;
    const shopId = eatDb.insert(schema.shops).values({ householdId: eatHid, name: "Costco" }).returning().all()[0].id;
    eatProductId = createProduct(eatDb, eatHid, { ingredientId: ingId, shopId, name: "Power Up Bag (16)", packSize: 16, priority: 1, url: null }).id;
    // record a purchase so stock is available for logEaten to deplete
    recordPurchase(eatDb, eatHid, { productId: eatProductId, quantity: 1 });
  });

  it("adds an eaten variant's nutrition to the day total", () => {
    const v = createVariant(eatDb, eatHid, eatProductId, { name: "Mega Omega", calories: 180, proteinG: 6 })!;
    logEaten(eatDb, eatHid, { date: "2026-06-29", productId: eatProductId, variantId: v.id, count: 2 });
    const day = dayNutrition(eatDb, eatHid, "2026-06-29");
    expect(day.total.calories).toBe(360); // 180 × 2
    expect(day.total.proteinG).toBe(12);
  });
});

describe("dayNutrition includes direct planner items", () => {
  it("a direct product-variant item adds variant nutrition × amount", () => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const productId = createProduct(db, hid, { ingredientId: flourId, shopId, name: "Trail Mix Bag", packSize: 1000, priority: 1, url: null }).id;
    // variant: 4 kcal per gram, 43 g per packet
    const variantId = createVariant(db, hid, productId, { name: "Mega Omega", servingSize: 43, calories: 4 })!.id;
    addEvent(db, hid, { date: "2026-07-01", slotId, productId, variantId, servings: 1 }); // amount = 43g
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(172); // 4 × 43
    expect(day.meals[0].recipeName).toBe("Mega Omega");
  });

  it("a direct ingredient item uses the preferred product's nutrition", () => {
    flourProduct({ calories: 2 }); // 2 kcal/g preferred product
    addEvent(db, hid, { date: "2026-07-01", slotId, ingredientId: flourId, amount: 100, servings: 1 });
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(200); // 2 × 100
  });
});
