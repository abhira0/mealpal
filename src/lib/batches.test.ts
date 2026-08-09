import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";
import { packBatch, listBatches, getBatch, eatFromBatch, uneatFromBatch } from "@/lib/batches";

let db: TestDb; let hid: number; let slotId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Lunch", timeOfDay: "12:00" }).returning().all()[0].id;
});

describe("batch tables", () => {
  it("can insert a batch with items and an eaten row", () => {
    const batch = db.insert(schema.batches).values({
      householdId: hid, slotId, label: "Biryani lunch", cookedDate: "2026-08-09",
      mealsTotal: 4, mealsRemaining: 4,
    }).returning().all()[0];
    expect(batch.id).toBeGreaterThan(0);
    db.insert(schema.batchItems).values({ batchId: batch.id, recipeId: null, amount: 1 }).run();
    db.insert(schema.batchEaten).values({ householdId: hid, batchId: batch.id, date: "2026-08-09" }).run();
    expect(db.select().from(schema.batchItems).all()).toHaveLength(1);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(1);
  });
});

describe("packBatch", () => {
  it("creates a batch at full count and depletes product stock by amount x mealsTotal", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Frozen Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Kirkland Veg", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g

    const batch = packBatch(db, hid, {
      slotId, label: "Lunch box", cookedDate: "2026-08-09", mealsTotal: 4,
      items: [{ productId: prod, amount: 100 }],
    });

    expect(batch.mealsTotal).toBe(4);
    expect(batch.mealsRemaining).toBe(4);
    expect(currentStock(db, hid, veg)).toBe(600); // 1000 - 100*4
    expect(db.select().from(schema.batchItems).all()).toHaveLength(1);
  });
});

describe("listBatches / getBatch", () => {
  it("lists active batches (remaining > 0) and reads one with items", () => {
    const b = packBatch(db, hid, { slotId, label: "Dinner", cookedDate: "2026-08-09", mealsTotal: 3, items: [] });
    const active = listBatches(db, hid);
    expect(active.map((x) => x.id)).toContain(b.id);
    const full = getBatch(db, hid, b.id);
    expect(full?.label).toBe("Dinner");
    expect(Array.isArray(full?.items)).toBe(true);
  });
});

describe("eatFromBatch / uneatFromBatch", () => {
  it("counts down on eat and back up on undo, flooring at 0", () => {
    const b = packBatch(db, hid, { slotId, label: "Lunch", cookedDate: "2026-08-09", mealsTotal: 2, items: [] });
    eatFromBatch(db, hid, b.id, "2026-08-09");
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(1);
    eatFromBatch(db, hid, b.id, "2026-08-10");
    eatFromBatch(db, hid, b.id, "2026-08-11"); // past 0
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(0);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(3);

    uneatFromBatch(db, hid, b.id, "2026-08-11");
    expect(getBatch(db, hid, b.id)?.mealsRemaining).toBe(1);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(2);
  });
});
