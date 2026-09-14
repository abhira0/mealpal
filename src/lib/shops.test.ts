import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createShop, listShops, deleteShop } from "@/lib/shops";
import { createProduct } from "@/lib/products";
import { recordPurchase, addExtra } from "@/lib/shopping";

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

  it("lists shops alphabetically regardless of insertion order", () => {
    createShop(db, hid, "Trader Joe's");
    createShop(db, hid, "Costco");
    createShop(db, hid, "Aldi");
    expect(listShops(db, hid).map((s) => s.name)).toEqual(["Aldi", "Costco", "Trader Joe's"]);
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

  // Regression: a shop can be referenced only via a purchase's or shopping-extra's
  // shopId override (independent of any product's default shop). With
  // foreign_keys=ON an unchecked delete used to throw a raw SqliteError instead
  // of returning the same friendly "can't delete" result as the product case.
  it("blocks deleting a shop referenced only by a purchase override", () => {
    const mainShop = createShop(db, hid, "Costco");
    const overrideShop = createShop(db, hid, "Trader Joe's");
    const ingredientId = db
      .insert(schema.ingredients)
      .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
      .returning()
      .all()[0].id;
    const product = createProduct(db, hid, {
      ingredientId, shopId: mainShop.id, name: "Flour 25lb", packSize: 1000, priority: 1, url: null,
    });
    recordPurchase(db, hid, { productId: product.id, quantity: 1, shopId: overrideShop.id });

    expect(() => deleteShop(db, hid, overrideShop.id)).not.toThrow();
    const result = deleteShop(db, hid, overrideShop.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/purchase/);
    // the shop the product itself points to is still blocked as before
    expect(deleteShop(db, hid, mainShop.id).ok).toBe(false);
  });

  it("blocks deleting a shop referenced only by a shopping-extra override", () => {
    const shop = createShop(db, hid, "Trader Joe's");
    addExtra(db, hid, { title: "Impulse buy", shopId: shop.id });

    const result = deleteShop(db, hid, shop.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/item/);
  });
});
