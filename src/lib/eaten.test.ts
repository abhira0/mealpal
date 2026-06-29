import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { createVariant } from "@/lib/variants";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";
import { logEaten, listEaten } from "@/lib/eaten";

let db: TestDb; let hid: number; let ingId: number; let productId: number; let variantId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  ingId = db.insert(schema.ingredients).values({ householdId: hid, name: "Trail Mix", canonicalUnit: "count" }).returning().all()[0].id;
  const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, { ingredientId: ingId, shopId: shop, name: "Power Up Bag (16)", packSize: 16, priority: 1, url: null }).id;
  variantId = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180 }).id;
  recordPurchase(db, hid, { productId, quantity: 1 }); // +16 count in stock
});

describe("logEaten", () => {
  it("records a consumption and depletes the product's stock", () => {
    logEaten(db, hid, { date: "2026-06-29", productId, variantId, count: 1 });
    expect(currentStock(db, hid, ingId)).toBe(15); // 16 - 1
    const rows = listEaten(db, hid, "2026-06-29");
    expect(rows).toHaveLength(1);
    expect(rows[0].variantId).toBe(variantId);
    expect(rows[0].count).toBe(1);
  });

  it("lists only the asked-for date", () => {
    logEaten(db, hid, { date: "2026-06-29", productId, variantId, count: 2 });
    logEaten(db, hid, { date: "2026-06-30", productId, variantId, count: 1 });
    expect(listEaten(db, hid, "2026-06-29")).toHaveLength(1);
    expect(listEaten(db, hid, "2026-06-29")[0].count).toBe(2);
  });
});
