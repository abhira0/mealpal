import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import {
  createProduct,
  addPrice,
  listProductsForIngredient,
  latestPrice,
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
      branchId: null,
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
      ingredientId, shopId, branchId: null, name: "B", packSize: 1000, priority: 3, url: null,
    });
    createProduct(db, hid, {
      ingredientId, shopId, branchId: null, name: "A", packSize: 1000, priority: 1, url: null,
    });
    const list = listProductsForIngredient(db, hid, ingredientId);
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("records price history and reports the latest price in cents", () => {
    const p = createProduct(db, hid, {
      ingredientId, shopId, branchId: null, name: "Flour", packSize: 1000, priority: 1, url: null,
    });
    addPrice(db, p.id, 1299, new Date("2026-01-01"));
    addPrice(db, p.id, 1349, new Date("2026-06-01"));
    expect(latestPrice(db, p.id)?.cents).toBe(1349);
  });
});
