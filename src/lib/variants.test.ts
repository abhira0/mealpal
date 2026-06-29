import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { createVariant, listVariants, updateVariant, deleteVariant } from "@/lib/variants";

let db: TestDb; let hid: number; let productId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  const ing = db.insert(schema.ingredients).values({ householdId: hid, name: "Trail Mix", canonicalUnit: "count" }).returning().all()[0].id;
  const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, { ingredientId: ing, shopId: shop, name: "Power Up Bag (16)", packSize: 16, priority: 1, url: null }).id;
});

describe("variants CRUD", () => {
  it("creates, lists, updates and deletes variants scoped to a product", () => {
    const a = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180, proteinG: 6 });
    const b = createVariant(db, hid, productId, { name: "High Energy", calories: 200 });
    expect(listVariants(db, hid, productId).map((v) => v.name)).toEqual(["Mega Omega", "High Energy"]);

    updateVariant(db, hid, a.id, { calories: 190 });
    expect(listVariants(db, hid, productId).find((v) => v.id === a.id)!.calories).toBe(190);

    expect(deleteVariant(db, hid, b.id)).toBe(true);
    expect(listVariants(db, hid, productId)).toHaveLength(1);
  });

  it("scopes by household — can't touch another home's variant", () => {
    const other = seedHousehold(db, "Other");
    const v = createVariant(db, hid, productId, { name: "Mega Omega" });
    expect(updateVariant(db, other, v.id, { calories: 5 })).toBeUndefined();
    expect(deleteVariant(db, other, v.id)).toBe(false);
  });
});
