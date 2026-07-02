import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { recordMovement, currentStock, stockByIngredient, expiryByIngredient, expiryByProduct, replaceManualExpiry } from "@/lib/stock";
import { and, eq } from "drizzle-orm";

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
  it("takes the earliest expiry across manual and purchase sources", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-10" });
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 1kg", packSize: 1000 })
      .returning().all()[0].id;
    db.insert(schema.purchases)
      .values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-07-05" }).run();
    expect(expiryByIngredient(db, hid).get(flourId)).toBe("2026-07-05");
  });
});

describe("replaceManualExpiry (pantry edit = replace in place)", () => {
  let shopId: number;
  let productId: number;
  beforeEach(() => {
    shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 1kg", packSize: 1000 })
      .returning().all()[0].id;
  });

  const manualRows = () =>
    db.select().from(schema.stockMovements)
      .where(and(eq(schema.stockMovements.productId, productId), eq(schema.stockMovements.reason, "manual")))
      .all();

  it("overwrites the on-hand batch's date in place — a later date now shows", () => {
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1800, reason: "manual", expiresAt: "2026-07-02" });
    replaceManualExpiry(db, hid, flourId, productId, "2026-08-02");
    expect(expiryByProduct(db, hid).get(productId)).toBe("2026-08-02");
    expect(manualRows()).toHaveLength(1); // no new row appended
    expect(currentStock(db, hid, flourId)).toBe(1800); // quantity untouched
  });

  it("collapses stale duplicate expiry rows down to one", () => {
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1800, reason: "manual", expiresAt: "2026-07-02" });
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 0, reason: "manual", expiresAt: "2026-08-02" });
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 0, reason: "manual", expiresAt: "2026-08-02" });
    replaceManualExpiry(db, hid, flourId, productId, "2026-09-01");
    expect(expiryByProduct(db, hid).get(productId)).toBe("2026-09-01");
    // the two bare delta-0 carriers are gone; only the real batch (delta 1800) remains
    const rows = manualRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(1800);
  });

  it("records a single carrier when the product has no manual movement yet", () => {
    replaceManualExpiry(db, hid, flourId, productId, "2026-09-01");
    expect(expiryByProduct(db, hid).get(productId)).toBe("2026-09-01");
    expect(manualRows()).toHaveLength(1);
    expect(currentStock(db, hid, flourId)).toBe(0); // delta-0 carrier adds no stock
  });

  it("still lets an earlier purchase win via min() across batches", () => {
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1800, reason: "manual", expiresAt: "2026-07-02" });
    db.insert(schema.purchases).values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-07-20" }).run();
    // push the manual date out past the purchase; the purchase is now soonest
    replaceManualExpiry(db, hid, flourId, productId, "2026-08-02");
    expect(expiryByProduct(db, hid).get(productId)).toBe("2026-07-20");
  });

  it("clearing the manual date drops it without touching purchases", () => {
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 0, reason: "manual", expiresAt: "2026-07-02" });
    db.insert(schema.purchases).values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-07-20" }).run();
    replaceManualExpiry(db, hid, flourId, productId, null);
    expect(expiryByProduct(db, hid).get(productId)).toBe("2026-07-20");
    expect(manualRows()).toHaveLength(0);
  });
});
