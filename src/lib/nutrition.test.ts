import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { recordCooked, unstockedIngredients } from "@/lib/consumption";
import { dayNutrition } from "@/lib/nutrition";

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
    recordCooked(db, hid, ev.recipeId, ev.servings, ev.id); // -500g attributed to pid
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
