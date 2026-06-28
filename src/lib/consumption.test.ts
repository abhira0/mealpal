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
