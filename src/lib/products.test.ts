import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import {
  createProduct,
  listProductsForIngredient,
  effectivePrice,
  listAllProducts,
  deleteProduct,
  reorderProducts,
  nextPriorityForIngredient,
} from "@/lib/products";

let db: TestDb;
let hid: number;
let ingredientId: number;
let shopId: number;

beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  ingredientId = db
    .insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g", servingSize: 50 })
    .returning()
    .all()[0].id;
  shopId = db
    .insert(schema.shops)
    .values({ householdId: hid, name: "Costco" })
    .returning()
    .all()[0].id;
});

describe("products & prices", () => {
  it("creates a product with a pack-size and returns it for its ingredient", () => {
    const p = createProduct(db, hid, {
      ingredientId,
      shopId,
      name: "Kirkland AP Flour 25lb",
      packSize: 11340,
      priority: 1,
      url: null,
    });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);
    expect(list[0].packSize).toBe(11340);
  });

  it("orders an ingredient's products by priority (preference list)", () => {
    createProduct(db, hid, {
      ingredientId, shopId, name: "B", packSize: 1000, priority: 3, url: null,
    });
    createProduct(db, hid, {
      ingredientId, shopId, name: "A", packSize: 1000, priority: 1, url: null,
    });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("effective price = latest purchase when no manual override", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    db.insert(schema.purchases).values({ householdId: hid, productId: p.id, quantity: 1, cents: 1299, purchasedAt: new Date("2026-01-01") }).run();
    db.insert(schema.purchases).values({ householdId: hid, productId: p.id, quantity: 1, cents: 1349, purchasedAt: new Date("2026-06-01") }).run();
    expect(effectivePrice(db, p.id)).toBe(1349);
  });

  it("manual override beats latest purchase; null when neither", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    expect(effectivePrice(db, p.id)).toBeNull();
    db.insert(schema.purchases).values({ householdId: hid, productId: p.id, quantity: 1, cents: 1349 }).run();
    db.update(schema.products).set({ priceCents: 999 }).where(eq(schema.products.id, p.id)).run();
    expect(effectivePrice(db, p.id)).toBe(999);
  });

  it("lists all household products with effective price and purchase history", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    db.insert(schema.purchases).values({ householdId: hid, productId: p.id, quantity: 1, cents: 1299 }).run();
    const all = listAllProducts(db, hid);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Flour");
    expect(all[0].effectiveCents).toBe(1299);
    expect(all[0].history).toHaveLength(1);
  });

  it("appends a new product at the bottom of the preference order", () => {
    expect(nextPriorityForIngredient(db, hid, ingredientId)).toBe(1);
    createProduct(db, hid, { ingredientId, shopId, name: "A", packSize: 1, priority: nextPriorityForIngredient(db, hid, ingredientId), url: null });
    createProduct(db, hid, { ingredientId, shopId, name: "B", packSize: 1, priority: nextPriorityForIngredient(db, hid, ingredientId), url: null });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list.map((p) => [p.name, p.priority])).toEqual([["A", 1], ["B", 2]]);
  });

  it("reorders products to 1..N in the given order", () => {
    const a = createProduct(db, hid, { ingredientId, shopId, name: "A", packSize: 1, priority: 1, url: null });
    const b = createProduct(db, hid, { ingredientId, shopId, name: "B", packSize: 1, priority: 2, url: null });
    const c = createProduct(db, hid, { ingredientId, shopId, name: "C", packSize: 1, priority: 3, url: null });
    reorderProducts(db, hid, ingredientId, [c.id, a.id, b.id]);
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list.map((p) => [p.name, p.priority])).toEqual([["C", 1], ["A", 2], ["B", 3]]);
  });

  it("reorder ignores ids outside the household/ingredient", () => {
    const a = createProduct(db, hid, { ingredientId, shopId, name: "A", packSize: 1, priority: 1, url: null });
    reorderProducts(db, hid, ingredientId, [99999, a.id]);
    expect(listProductsForIngredient(db, hid, ingredientId)[0].priority).toBe(1);
  });

  it("deletes an unreferenced product", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    expect(deleteProduct(db, hid, p.id)).toEqual({ ok: true, deleted: true });
    expect(listProductsForIngredient(db, hid, ingredientId)).toHaveLength(0);
  });

  it("blocks deleting a product with purchases", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    db.insert(schema.purchases).values({ householdId: hid, productId: p.id, quantity: 1, cents: 1299 }).run();
    const result = deleteProduct(db, hid, p.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/purchase/);
  });
});
