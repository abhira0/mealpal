import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe } from "@/lib/recipes";

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
      steps: [{ text: "Mix" }, { text: "Bake" }],
      media: [{ kind: "youtube", url: "https://youtu.be/x" }],
    });
    const full = getRecipe(db, hid, r.id);
    expect(full?.name).toBe("Bread");
    expect(full?.ingredients).toHaveLength(1);
    expect(full?.ingredients[0].amount).toBe(500);
    expect(full?.steps.map((s) => s.text)).toEqual(["Mix", "Bake"]);
    expect(full?.media[0].url).toBe("https://youtu.be/x");
  });

  it("round-trips totalMinutes through create and update", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: null, totalMinutes: 45,
      ingredients: [], steps: [], media: [],
    });
    expect(getRecipe(db, hid, r.id)?.totalMinutes).toBe(45);
    updateRecipe(db, hid, r.id, {
      name: "Bread", baseServings: 2, notes: null, totalMinutes: null,
      ingredients: [], steps: [], media: [],
    });
    expect(getRecipe(db, hid, r.id)?.totalMinutes).toBeNull();
  });

  it("persists per-step clip times", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 1, notes: null,
      ingredients: [],
      steps: [{ text: "Mix", startSeconds: 30, endSeconds: 48 }, { text: "Bake" }],
      media: [],
    });
    const steps = getRecipe(db, hid, r.id)!.steps;
    expect(steps[0].startSeconds).toBe(30);
    expect(steps[0].endSeconds).toBe(48);
    expect(steps[1].startSeconds).toBeNull();
  });

  it("updates a recipe and replaces its children", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: "old",
      ingredients: [{ ingredientId: flourId, amount: 500 }],
      steps: [{ text: "Mix" }, { text: "Bake" }], media: [],
    });
    const ok = updateRecipe(db, hid, r.id, {
      name: "Sourdough", baseServings: 4, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 600 }],
      steps: [{ text: "Knead" }], media: [],
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

  it("deletes a recipe and its children", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 500 }],
      steps: [{ text: "Mix" }], media: [{ kind: "youtube", url: "https://youtu.be/x" }],
    });
    expect(deleteRecipe(db, hid, r.id)).toEqual({ ok: true, deleted: true });
    expect(getRecipe(db, hid, r.id)).toBeUndefined();
    expect(db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, r.id)).all()).toHaveLength(0);
  });

  it("won't delete a recipe used by a planned meal", () => {
    const r = createRecipe(db, hid, { name: "Bread", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] });
    const slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Dinner" }).returning().all()[0].id;
    db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-06-28", slotId, recipeId: r.id }).run();
    const res = deleteRecipe(db, hid, r.id);
    expect(res.ok).toBe(false);
    expect(getRecipe(db, hid, r.id)).toBeTruthy();
  });

  it("won't delete another household's recipe", () => {
    const other = seedHousehold(db, "Other");
    const r = createRecipe(db, other, { name: "Secret", baseServings: 1, notes: null, ingredients: [], steps: [], media: [] });
    expect(deleteRecipe(db, hid, r.id)).toEqual({ ok: true, deleted: false });
    expect(getRecipe(db, other, r.id)?.name).toBe("Secret");
  });
});
