import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
let shopId: number;
let productId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning().all()[0].id;
  shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, {
    ingredientId: flourId, shopId, name: "AP Flour 25lb",
    packSize: 11340, priority: 1, url: null,
  }).id;
});

describe("recordPurchase", () => {
  it("buying 1 product restocks packSize*qty into inventory and records the purchase", () => {
    recordPurchase(db, hid, { productId, quantity: 1, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(11340);
    const purchases = db.select().from(schema.purchases)
      .where(eq(schema.purchases.householdId, hid)).all();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].cents).toBe(1299);
  });

  it("buying 2 adds 2x the pack size", () => {
    recordPurchase(db, hid, { productId, quantity: 2, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(22680);
  });
});
