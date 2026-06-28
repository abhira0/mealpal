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
