import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { recordMovement, currentStock, stockByIngredient } from "@/lib/stock";

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

describe("stock ledger", () => {
  it("sums signed deltas into current stock", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 1000, reason: "purchase" });
    recordMovement(db, hid, { ingredientId: flourId, delta: -300, reason: "cooked" });
    expect(currentStock(db, hid, flourId)).toBe(700);
  });
  it("returns 0 for an ingredient with no movements", () => {
    expect(currentStock(db, hid, flourId)).toBe(0);
  });
  it("reports stock for every ingredient with movements, scoped to household", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual" });
    const map = stockByIngredient(db, hid);
    expect(map.get(flourId)).toBe(500);
  });
});
