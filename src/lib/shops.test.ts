import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createShop, listShops, deleteShop } from "@/lib/shops";
import { createProduct } from "@/lib/products";

let db: TestDb;
let hid: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
});

describe("shops", () => {
  it("creates and lists shops scoped to a household", () => {
    createShop(db, hid, "Costco");
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Walmart");
    const mine = listShops(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Costco");
  });

  it("does not list another household's shops", () => {
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Target");
    expect(listShops(db, hid)).toHaveLength(0);
  });

  it("deletes an unreferenced shop", () => {
    const shop = createShop(db, hid, "Costco");
    const result = deleteShop(db, hid, shop.id);
    expect(result).toEqual({ ok: true, deleted: true });
    expect(listShops(db, hid)).toHaveLength(0);
  });

  it("blocks deleting a shop with products", () => {
    const shop = createShop(db, hid, "Costco");
    const ingredientId = db
      .insert(schema.ingredients)
      .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
      .returning()
      .all()[0].id;
    createProduct(db, hid, {
      ingredientId, shopId: shop.id, name: "Flour 25lb", packSize: 1000, priority: 1, url: null,
    });
    const result = deleteShop(db, hid, shop.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/product/);
  });
});
