import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { createRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";
import { packBatch, listBatches, getBatch, eatFromBatch, uneatFromBatch, unpackBatch } from "@/lib/batches";

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

  it("depletes stock for a recipe item by (amount at 1 serving) x mealsTotal", () => {
    const rice = db.insert(schema.ingredients).values({ householdId: hid, name: "Rice", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: rice, shopId: shop, name: "Basmati", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g
    const recipe = createRecipe(db, hid, {
      name: "Rice bowl", baseServings: 1, notes: null,
      ingredients: [{ ingredientId: rice, amount: 200 }], steps: [], media: [], // 200 g / serving
    });

    packBatch(db, hid, {
      slotId, label: "Rice meals", cookedDate: "2026-08-09", mealsTotal: 3,
      items: [{ recipeId: recipe.id, amount: 1 }],
    });

    expect(currentStock(db, hid, rice)).toBe(400); // 1000 - 200*1*3
  });

  it("splits a product item's depletion FEFO across the product's lots", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Frozen Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Kirkland Veg", packSize: 300, priority: 1, url: null }).id;
    const soon = recordPurchase(db, hid, { productId: prod, quantity: 1, expiresAt: "2026-08-10" }); // +300, expires first
    const later = recordPurchase(db, hid, { productId: prod, quantity: 1, expiresAt: "2026-09-10" }); // +300

    packBatch(db, hid, {
      slotId, label: "Lunch box", cookedDate: "2026-08-09", mealsTotal: 4,
      items: [{ productId: prod, amount: 100 }], // 400 total: exhausts lot 1 (300), draws 100 from lot 2
    });

    const movements = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.reason, "cooked")).all();
    expect(movements).toHaveLength(2);
    expect(movements[0].purchaseId).toBe(soon.id);
    expect(movements[0].delta).toBe(-300);
    expect(movements[1].purchaseId).toBe(later.id);
    expect(movements[1].delta).toBe(-100);
    expect(currentStock(db, hid, veg)).toBe(200); // 600 - 400
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

describe("unpackBatch", () => {
  it("restores the exact stock the pack depleted and removes the batch + its rows", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Frozen Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Kirkland Veg", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g

    const b = packBatch(db, hid, {
      slotId, label: "Lunch box", cookedDate: "2026-08-09", mealsTotal: 4,
      items: [{ productId: prod, amount: 100 }],
    });
    eatFromBatch(db, hid, b.id, "2026-08-09");
    expect(currentStock(db, hid, veg)).toBe(600); // 1000 - 100*4

    expect(unpackBatch(db, hid, b.id)).toBe(true);
    expect(currentStock(db, hid, veg)).toBe(1000); // fully restored
    expect(getBatch(db, hid, b.id)).toBeNull();
    expect(db.select().from(schema.batchItems).all()).toHaveLength(0);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(0);
  });

  it("only reverses its own batch's movements when two batches coexist", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Veg bag", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g

    const a = packBatch(db, hid, { slotId, label: "A", cookedDate: "2026-08-09", mealsTotal: 2, items: [{ productId: prod, amount: 100 }] }); // -200
    packBatch(db, hid, { slotId, label: "B", cookedDate: "2026-08-09", mealsTotal: 3, items: [{ productId: prod, amount: 100 }] }); // -300
    expect(currentStock(db, hid, veg)).toBe(500);

    unpackBatch(db, hid, a.id); // restores only A's 200
    expect(currentStock(db, hid, veg)).toBe(700);
  });

  it("returns false for a batch in another household", () => {
    const b = packBatch(db, hid, { slotId, label: "Mine", cookedDate: "2026-08-09", mealsTotal: 2, items: [] });
    expect(unpackBatch(db, hid + 999, b.id)).toBe(false);
    expect(getBatch(db, hid, b.id)).not.toBeNull();
  });

  // The PATCH /api/batches/[id] re-pack path: unpack + pack nested in one txn.
  it("re-packs (unpack then pack) in a single outer transaction with the right net stock", () => {
    const veg = db.insert(schema.ingredients).values({ householdId: hid, name: "Veg", canonicalUnit: "g" }).returning().all()[0].id;
    const shop = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    const prod = createProduct(db, hid, { ingredientId: veg, shopId: shop, name: "Veg bag", packSize: 1000, priority: 1, url: null }).id;
    recordPurchase(db, hid, { productId: prod, quantity: 1 }); // +1000 g

    const b = packBatch(db, hid, { slotId, label: "Old", cookedDate: "2026-08-09", mealsTotal: 4, items: [{ productId: prod, amount: 100 }] }); // -400
    expect(currentStock(db, hid, veg)).toBe(600);

    const repacked = db.transaction(() => {
      expect(unpackBatch(db, hid, b.id)).toBe(true);
      return packBatch(db, hid, { slotId, label: "New", cookedDate: "2026-08-10", mealsTotal: 6, items: [{ productId: prod, amount: 100 }] }); // -600
    });

    expect(repacked.label).toBe("New");
    expect(currentStock(db, hid, veg)).toBe(400); // 1000 - 600, old 400 restored first
    expect(getBatch(db, hid, b.id)).toBeNull();
    expect(listBatches(db, hid).map((x) => x.label)).toEqual(["New"]);
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
