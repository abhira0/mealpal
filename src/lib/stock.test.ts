import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { recordMovement, currentStock, stockByIngredient, expiryByIngredient } from "@/lib/stock";

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
  it("surfaces the soonest expiry among positive movements, ignoring null/consumption", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-10" });
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-03" });
    recordMovement(db, hid, { ingredientId: flourId, delta: -200, reason: "cooked", expiresAt: null });
    expect(expiryByIngredient(db, hid).get(flourId)).toBe("2026-07-03");
  });
});
