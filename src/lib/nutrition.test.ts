import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe, updateRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { recordCooked, unstockedIngredients } from "@/lib/consumption";
import { dayNutrition, scorecards, zeroNutrients, mondayOf, macroSplit, dayIngredientTable, weekIngredientTable, weekNutrition, batchServingNutrients } from "@/lib/nutrition";
import { createVariant } from "@/lib/variants";
import { logEaten } from "@/lib/eaten";
import { createProduct } from "@/lib/products";
import { addEvent } from "@/lib/plan";
import { packBatch, eatFromBatch } from "@/lib/batches";

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

function event(recipeId: number, status: "planned" | "cooked" | "served" = "planned") {
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
    // estimate shows on the meal card, but a planned meal is not counted in the day total
    expect(day.meals[0].nutrients.calories).toBe(1000); // 500g * 2 kcal/g
    expect(day.meals[0].nutrients.proteinG).toBeCloseTo(50); // 500g * 0.1
    expect(day.total.calories).toBe(0);
    expect(day.total.proteinG).toBe(0);
    // planned total counts the estimate even though the cooked total doesn't
    expect(day.planned.calories).toBe(1000);
    expect(day.missing).toEqual([]);
  });

  it("a cooked-but-not-served meal is still an estimate and contributes 0 to the total", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 1 }); // +1000g on pid
    const ev = event(bread().id, "cooked");
    recordCooked(db, hid, ev.recipeId!, ev.servings, ev.id); // stock depleted, but not yet served
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.meals[0].estimate).toBe(true);
    expect(day.total.calories).toBe(0);
  });

  it("served meal is exact, from the actual product the cook recorded", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 1 }); // +1000g on pid
    const ev = event(bread().id, "served");
    recordCooked(db, hid, ev.recipeId!, ev.servings, ev.id); // -500g attributed to pid
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.meals[0].estimate).toBe(false);
    expect(day.total.calories).toBe(1000);
  });

  it("served meal counts the chosen variant's nutrition, not the product's", () => {
    const pid = flourProduct({ calories: 2 }); // product: 2 kcal/g
    const variantId = createVariant(db, hid, pid, { name: "Fortified", calories: 5 })!.id; // 5 kcal/g
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    const ev = event(bread().id, "served");
    recordCooked(db, hid, ev.recipeId!, ev.servings, ev.id, new Map([[flourId, { productId: pid, variantId }]]));
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(2500); // 500g * 5 from the variant, not 2
  });

  it("flags on the meal card ingredients whose product has no nutrition", () => {
    flourProduct({ calories: null }); // photo not yet read into numbers
    event(bread().id, "planned");
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(0);
    expect(day.meals[0].missing).toEqual(["Flour"]);
  });

  it("ignores a product with no calories, even if other nutrients are filled in", () => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    db.insert(schema.products).values({
      householdId: hid, ingredientId: flourId, shopId, name: "Brand A", packSize: 1000, priority: 1,
      calories: null, proteinG: 0.1, // protein saved but calories left blank → half-entered
    }).returning().all();
    event(bread().id, "planned");
    const day = dayNutrition(db, hid, "2026-07-01");
    // calories is the anchor: a half-entered product would otherwise produce
    // garbage per-gram totals, so it does not count and is flagged missing.
    expect(day.meals[0].nutrients.proteinG).toBe(0);
    expect(day.meals[0].missing).toEqual(["Flour"]);
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
    // planned events only show under the "planned" basis (default is "served")
    const day = dayIngredientTable(db, hid, "2026-06-30", "planned");
    expect(day.find((x) => x.name === "Flour")!.qty).toBe(500);
    const week = weekIngredientTable(db, hid, mondayOf("2026-06-30"), "planned");
    expect(week.find((x) => x.name === "Flour")!.qty).toBe(1000); // 500 + 500
  });

  it("served basis excludes not-yet-eaten (planned/cooked) meals", () => {
    flourProduct({ calories: 2 });
    const r = bread().id;
    db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-06-30", slotId, recipeId: r, servings: 1, status: "planned" }).run();
    expect(dayIngredientTable(db, hid, "2026-06-30", "served")).toHaveLength(0);
    expect(dayIngredientTable(db, hid, "2026-06-30", "planned").length).toBeGreaterThan(0);
  });
});

describe("weekNutrition", () => {
  it("averages `average` over days actually served, not days with only a planned meal", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g × 500g/serving = 1000 kcal
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    const r = bread().id;
    const served = db.insert(schema.mealEvents)
      .values({ householdId: hid, date: "2026-06-30", slotId, recipeId: r, servings: 1, status: "served" })
      .returning().all()[0];
    recordCooked(db, hid, r, served.servings, served.id); // 1000 kcal actually eaten, day 1
    // Same week, a second day with only a planned (not yet eaten) meal.
    db.insert(schema.mealEvents)
      .values({ householdId: hid, date: "2026-07-02", slotId, recipeId: r, servings: 1, status: "planned" })
      .run();
    const week = weekNutrition(db, hid, mondayOf("2026-06-30"));
    expect(week.daysWithMeals).toBe(2); // both days count as "has meals"
    // Before the fix, `average` divided the 1000 served kcal by daysWithMeals (2),
    // undercounting to 500 instead of the true per-served-day average of 1000.
    expect(week.average.calories).toBe(1000);
    expect(week.plannedAverage.calories).toBe(1000); // planned counts both days too, (1000+1000)/2
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

describe("batchServingNutrients", () => {
  it("sums the nutrition of one serving from a batch's product item", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g preferred product
    recordPurchase(db, hid, { productId: pid, quantity: 1 }); // stock for packing
    const batch = packBatch(db, hid, {
      slotId, label: "Dal", cookedDate: "2026-07-01", mealsTotal: 4,
      items: [{ productId: pid, amount: 100 }], // 100g per serving
    });
    expect(batchServingNutrients(db, hid, batch.id).calories).toBe(200); // 2 × 100
  });

  it("sums one serving's nutrition from a batch's recipe item", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g preferred product
    recordPurchase(db, hid, { productId: pid, quantity: 1 }); // stock for packing
    const batch = packBatch(db, hid, {
      slotId, label: "Bread batch", cookedDate: "2026-07-01", mealsTotal: 1,
      items: [{ recipeId: bread().id, amount: 1 }], // 500 g flour / serving
    });
    expect(batchServingNutrients(db, hid, batch.id).calories).toBe(1000); // 500g × 2
  });

  it("a variant with no nutrition filled in falls back to the product's, not zero", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g product
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    // Variant only has a name + serving size — no nutrient fields set.
    const variantId = createVariant(db, hid, pid, { name: "Family Pack", servingSize: 100 })!.id;
    const batch = packBatch(db, hid, {
      slotId, label: "Dal", cookedDate: "2026-07-01", mealsTotal: 4,
      items: [{ productId: pid, variantId, amount: 100 }],
    });
    expect(batchServingNutrients(db, hid, batch.id).calories).toBe(200); // falls back to 2 × 100
  });
});

describe("recipe edits don't rewrite history", () => {
  it("a cooked event and a packed batch keep the nutrition they were cooked with", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 3 });
    const recipe = bread(); // 500 g flour
    const ev = event(recipe.id, "cooked");
    recordCooked(db, hid, recipe.id, ev.servings, ev.id);
    const batch = packBatch(db, hid, {
      slotId, label: "Bread batch", cookedDate: "2026-07-01", mealsTotal: 1,
      items: [{ recipeId: recipe.id, amount: 1 }],
    });

    // Double the recipe's flour AFTER both were cooked.
    updateRecipe(db, hid, recipe.id, {
      name: "Bread", baseServings: 1, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 1000 }], steps: [], media: [],
    });

    const cooked = dayNutrition(db, hid, "2026-07-01").meals.find((m) => m.eventId === ev.id)!;
    expect(cooked.nutrients.calories).toBe(1000); // 500g × 2, not 2000
    expect(batchServingNutrients(db, hid, batch.id).calories).toBe(1000);
  });
});

describe("label edits don't rewrite history", () => {
  it("a served meal, a batch and a quick-log keep the label they were logged with", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g at cook time
    recordPurchase(db, hid, { productId: pid, quantity: 5 });
    const recipe = bread();
    const ev = event(recipe.id, "served");
    recordCooked(db, hid, recipe.id, ev.servings, ev.id); // 500 g → 1000 kcal
    const batch = packBatch(db, hid, {
      slotId, label: "Bread batch", cookedDate: "2026-07-01", mealsTotal: 1,
      items: [{ recipeId: recipe.id, amount: 1 }],
    });
    eatFromBatch(db, hid, batch.id, "2026-07-01");
    logEaten(db, hid, { date: "2026-07-01", productId: pid, count: 100 }); // 200 kcal

    // Relabel the product AFTER all three were logged.
    db.update(schema.products).set({ calories: 10 })
      .where(eq(schema.products.id, pid)).run();

    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.total.calories).toBe(1000 + 1000 + 200); // not re-valued at 10 kcal/g
    // the ingredient table must still reconcile with those totals
    const table = dayIngredientTable(db, hid, "2026-07-01", "served");
    const tableCals = table.reduce((a, r) => a + (r.values.calories ?? 0), 0);
    expect(Math.round(tableCals)).toBe(Math.round(day.total.calories));
  });
});

describe("dayNutrition counts batch servings eaten", () => {
  it("adds one serving's nutrition per batchEaten row (eaten basis)", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g → 100g serving = 200 kcal
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Dal", cookedDate: "2026-07-01", mealsTotal: 4,
      items: [{ productId: pid, amount: 100 }],
    });
    // cooked-but-uneaten contributes nothing to the day total
    expect(dayNutrition(db, hid, "2026-07-01").total.calories).toBe(0);
    eatFromBatch(db, hid, batch.id, "2026-07-01");
    expect(dayNutrition(db, hid, "2026-07-01").total.calories).toBe(200);
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
    expect(day.meals[0].nutrients.calories).toBe(172); // 4 × 43 (planned → on card, not in total)
    expect(day.meals[0].recipeName).toBe("Mega Omega");
  });

  it("a direct ingredient item uses the preferred product's nutrition", () => {
    flourProduct({ calories: 2 }); // 2 kcal/g preferred product
    addEvent(db, hid, { date: "2026-07-01", slotId, ingredientId: flourId, amount: 100, servings: 1 });
    const day = dayNutrition(db, hid, "2026-07-01");
    expect(day.meals[0].nutrients.calories).toBe(200); // 2 × 100 (planned → on card, not in total)
  });
});

describe("dayIngredientTable counts batch servings eaten", () => {
  it("includes a product-item batch serving, matching dayNutrition", () => {
    const pid = flourProduct({ calories: 2 }); // 2 kcal/g → 100g serving = 200 kcal
    recordPurchase(db, hid, { productId: pid, quantity: 1 });
    const batch = packBatch(db, hid, {
      slotId, label: "Dal", cookedDate: "2026-07-01", mealsTotal: 4,
      items: [{ productId: pid, amount: 100 }],
    });
    // cooked but not eaten: nothing on the table yet
    expect(dayIngredientTable(db, hid, "2026-07-01")).toHaveLength(0);

    eatFromBatch(db, hid, batch.id, "2026-07-01");
    const rows = dayIngredientTable(db, hid, "2026-07-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(100);
    expect(rows[0].values.calories).toBe(200);
  });

  it("scales a recipe-item batch serving by baseServings", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 10 });
    const recipe = bread(); // baseServings 1, 500g flour
    const batch = packBatch(db, hid, {
      slotId, label: "Loaf", cookedDate: "2026-07-01", mealsTotal: 2,
      items: [{ recipeId: recipe.id, amount: 1 }], // one serving of a 1-serving recipe
    });
    eatFromBatch(db, hid, batch.id, "2026-07-01");
    const rows = dayIngredientTable(db, hid, "2026-07-01");
    expect(rows[0].qty).toBe(500);
    expect(rows[0].values.calories).toBe(1000);
  });

  // The invariant that matters: the breakdown must reconcile with the totals.
  // Before batch expansion the table silently dropped every batch meal.
  it("ingredient calories reconcile with dayNutrition totals", () => {
    const pid = flourProduct({ calories: 2 });
    recordPurchase(db, hid, { productId: pid, quantity: 10 });
    const recipe = bread();
    const ev = event(recipe.id);
    recordCooked(db, hid, recipe.id, 1, ev.id);
    db.update(schema.mealEvents).set({ status: "served" }).run();
    const batch = packBatch(db, hid, {
      slotId, label: "Dal", cookedDate: "2026-07-01", mealsTotal: 4,
      items: [{ productId: pid, amount: 100 }],
    });
    eatFromBatch(db, hid, batch.id, "2026-07-01");

    const total = dayNutrition(db, hid, "2026-07-01").total.calories;
    const fromTable = dayIngredientTable(db, hid, "2026-07-01")
      .reduce((sum, r) => sum + (r.values.calories ?? 0), 0);
    expect(total).toBe(1200); // 1000 recipe + 200 batch
    expect(fromTable).toBe(total);
  });
});
