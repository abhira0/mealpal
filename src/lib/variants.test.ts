import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
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
    const a = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180, proteinG: 6 })!;
    const b = createVariant(db, hid, productId, { name: "High Energy", calories: 200 })!;
    expect(listVariants(db, hid, productId).map((v) => v.name)).toEqual(["Mega Omega", "High Energy"]);

    updateVariant(db, hid, a.id, { calories: 190 });
    expect(listVariants(db, hid, productId).find((v) => v.id === a.id)!.calories).toBe(190);

    expect(deleteVariant(db, hid, b.id)).toBe(true);
    expect(listVariants(db, hid, productId)).toHaveLength(1);
  });

  it("updateVariant with an empty patch returns the row unchanged instead of throwing", () => {
    const a = createVariant(db, hid, productId, { name: "Mega Omega", calories: 180 })!;
    expect(() => updateVariant(db, hid, a.id, {})).not.toThrow();
    expect(updateVariant(db, hid, a.id, {})).toEqual(expect.objectContaining({ id: a.id, name: "Mega Omega" }));
  });

  it("won't create a variant on a product from another household", () => {
    const other = seedHousehold(db, "Other");
    expect(createVariant(db, other, productId, { name: "Sneaky" })).toBeUndefined();
    expect(listVariants(db, hid, productId)).toHaveLength(0);
  });

  it("scopes by household — can't touch another home's variant", () => {
    const other = seedHousehold(db, "Other");
    const v = createVariant(db, hid, productId, { name: "Mega Omega" })!;
    expect(updateVariant(db, other, v.id, { calories: 5 })).toBeUndefined();
    expect(deleteVariant(db, other, v.id)).toBe(false);
  });

  it("deletes a variant that's referenced by stock movements/events/rules without a FK error", () => {
    const v = createVariant(db, hid, productId, { name: "Mega Omega" })!;
    const slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Snack" }).returning().all()[0].id;
    const ing = db.select().from(schema.products).where(eq(schema.products.id, productId)).all()[0].ingredientId;
    db.insert(schema.stockMovements).values({
      householdId: hid, ingredientId: ing, productId, variantId: v.id, delta: -1, reason: "eaten",
    }).run();
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-01-01", slotId, productId, variantId: v.id, servings: 1,
    }).run();
    db.insert(schema.mealRules).values({
      householdId: hid, slotId, productId, variantId: v.id, startDate: "2026-01-01",
    }).run();

    expect(() => deleteVariant(db, hid, v.id)).not.toThrow();
    expect(deleteVariant(db, hid, v.id)).toBe(false); // already gone

    // referencing rows survive with the link cleared
    expect(db.select().from(schema.stockMovements).all()[0].variantId).toBeNull();
    expect(db.select().from(schema.mealEvents).all()[0].variantId).toBeNull();
    expect(db.select().from(schema.mealRules).all()[0].variantId).toBeNull();
  });

  it("rolls back all variantId nulling if the final delete fails mid-sequence", () => {
    const v = createVariant(db, hid, productId, { name: "Mega Omega" })!;
    const ing = db.select().from(schema.products).where(eq(schema.products.id, productId)).all()[0].ingredientId;
    db.insert(schema.stockMovements).values({
      householdId: hid, ingredientId: ing, productId, variantId: v.id, delta: -1, reason: "eaten",
    }).run();

    // Force the last statement (the variant delete) to fail after the earlier
    // updates in the sequence have run, simulating a mid-transaction failure.
    const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
    sqlite.exec(`
      CREATE TRIGGER block_variant_delete
      BEFORE DELETE ON product_variants
      WHEN old.id = ${v.id}
      BEGIN
        SELECT RAISE(ABORT, 'forced failure for test');
      END;
    `);

    expect(() => deleteVariant(db, hid, v.id)).toThrow();

    sqlite.exec(`DROP TRIGGER block_variant_delete;`);

    // Because the whole sequence ran in one transaction, the failed delete
    // must have rolled back the earlier variantId-nulling updates too.
    expect(db.select().from(schema.stockMovements).all()[0].variantId).toBe(v.id);
    expect(listVariants(db, hid, productId).some((row) => row.id === v.id)).toBe(true);
  });
});
