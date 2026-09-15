import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import {
  createIngredient,
  listIngredients,
  updateIngredient,
  deleteIngredient,
} from "@/lib/ingredients";

let db: TestDb;
let hid: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
});

describe("ingredients", () => {
  it("creates and lists ingredients scoped to a household", () => {
    createIngredient(db, hid, { name: "Flour", canonicalUnit: "g" });
    const other = seedHousehold(db, "Other");
    createIngredient(db, other, { name: "Sugar", canonicalUnit: "g" });

    const mine = listIngredients(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Flour");
  });

  it("updates an ingredient within the household", () => {
    const ing = createIngredient(db, hid, {
      name: "Milk",
      canonicalUnit: "ml",
    });
    const updated = updateIngredient(db, hid, ing.id, { name: "Whole Milk" });
    expect(updated?.name).toBe("Whole Milk");
  });

  it("reports stock for every ingredient in one batched query, defaulting to 0 with no movements", () => {
    const withStock = createIngredient(db, hid, { name: "Rice", canonicalUnit: "g" });
    const noMovements = createIngredient(db, hid, { name: "Pepper", canonicalUnit: "g" });
    db.insert(schema.stockMovements).values({ householdId: hid, ingredientId: withStock.id, delta: 500, reason: "manual" }).run();

    const list = listIngredients(db, hid);
    const rice = list.find((i) => i.id === withStock.id);
    const pepper = list.find((i) => i.id === noMovements.id);
    expect(rice?.stock).toBe(500);
    expect(pepper?.stock).toBe(0);
  });

  it("does not update an ingredient from another household", () => {
    const other = seedHousehold(db, "Other");
    const ing = createIngredient(db, other, {
      name: "Oats",
      canonicalUnit: "g",
    });
    const result = updateIngredient(db, hid, ing.id, { name: "Hacked" });
    expect(result).toBeUndefined();
  });

  it("blocks deleting an ingredient with stock movements", () => {
    const ing = createIngredient(db, hid, { name: "Salt", canonicalUnit: "g" });
    db.insert(schema.stockMovements).values({ householdId: hid, ingredientId: ing.id, delta: 5, reason: "manual" }).run();
    const result = deleteIngredient(db, hid, ing.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/stock movement/);
  });

  it("deletes an ingredient referenced by meal events/rules/batch items (clears FKs, no crash)", () => {
    const ing = createIngredient(db, hid, { name: "Salt", canonicalUnit: "g" });
    const slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Snack" }).returning().all()[0].id;
    const ev = db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-01-01", slotId, ingredientId: ing.id, amount: 5, servings: 1 }).returning().all()[0];
    const rule = db.insert(schema.mealRules).values({ householdId: hid, slotId, ingredientId: ing.id, startDate: "2026-01-01" }).returning().all()[0];
    const batch = db.insert(schema.batches).values({ householdId: hid, slotId, label: "Batch", cookedDate: "2026-01-01", mealsTotal: 1, mealsRemaining: 1 }).returning().all()[0];
    db.insert(schema.batchItems).values({ batchId: batch.id, ingredientId: ing.id }).run();

    expect(deleteIngredient(db, hid, ing.id)).toEqual({ ok: true, deleted: true });
    expect(db.select().from(schema.mealEvents).where(eq(schema.mealEvents.id, ev.id)).all()[0].ingredientId).toBeNull();
    expect(db.select().from(schema.mealRules).where(eq(schema.mealRules.id, rule.id)).all()[0].ingredientId).toBeNull();
    expect(db.select().from(schema.batchItems).where(eq(schema.batchItems.batchId, batch.id)).all()[0].ingredientId).toBeNull();
  });
});
