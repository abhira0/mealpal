import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe, getRecipe, listRecipes, updateRecipe } from "@/lib/recipes";

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
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

  it("updates a recipe and replaces its children", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: "old",
      ingredients: [{ ingredientId: flourId, amount: 500 }],
      steps: ["Mix", "Bake"], media: [],
    });
    const ok = updateRecipe(db, hid, r.id, {
      name: "Sourdough", baseServings: 4, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 600 }],
      steps: ["Knead"], media: [],
    });
    expect(ok).toBeTruthy();
    const full = getRecipe(db, hid, r.id);
    expect(full?.name).toBe("Sourdough");
    expect(full?.baseServings).toBe(4);
    expect(full?.ingredients).toHaveLength(1);
    expect(full?.ingredients[0].amount).toBe(600);
    expect(full?.steps.map((s) => s.text)).toEqual(["Knead"]);
  });

  it("won't update another household's recipe", () => {
    const other = seedHousehold(db, "Other");
    const r = createRecipe(db, other, { name: "Secret", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] });
    expect(updateRecipe(db, hid, r.id, { name: "Hacked", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] })).toBeUndefined();
    expect(getRecipe(db, other, r.id)?.name).toBe("Secret");
  });

  it("scopes recipes to the household", () => {
    const other = seedHousehold(db, "Other");
    createRecipe(db, other, { name: "Secret", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] });
    expect(listRecipes(db, hid)).toHaveLength(0);
  });
});
