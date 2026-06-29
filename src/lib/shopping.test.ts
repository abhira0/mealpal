import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { recordPurchase, listPendingPurchases, updatePurchase } from "@/lib/shopping";
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

describe("pending purchases (bill flow)", () => {
  it("records price-less, lists it as pending, then fills it in", () => {
    // check-off in the store: no price, but it restocks immediately
    const pid = recordPurchase(db, hid, { productId, quantity: 1 }).id;
    expect(currentStock(db, hid, flourId)).toBe(11340);

    const pending = listPendingPurchases(db, hid);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(pid);

    // enter the bill at home: price + expiry, and bump qty 1 → 2
    updatePurchase(db, hid, pid, { cents: 1499, expiresAt: "2026-07-01", quantity: 2 });

    expect(listPendingPurchases(db, hid)).toHaveLength(0); // priced → no longer pending
    expect(currentStock(db, hid, flourId)).toBe(22680);    // qty change re-synced restock
    const row = db.select().from(schema.purchases).where(eq(schema.purchases.id, pid)).all()[0];
    expect(row.cents).toBe(1499);
    expect(row.expiresAt).toBe("2026-07-01");
  });
});
