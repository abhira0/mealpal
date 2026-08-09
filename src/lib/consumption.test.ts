import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { recordPurchase } from "@/lib/shopping";
import { currentStock, stockByProduct } from "@/lib/stock";
import { consumptionForRecipe, recordCooked, cookChoices } from "@/lib/consumption";
import { createVariant } from "@/lib/variants";

function seedFlourProducts(db: TestDb, hid: number, flourId: number) {
  const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
  const a = db.insert(schema.products)
    .values({ householdId: hid, ingredientId: flourId, shopId, name: "Brand A", packSize: 1000, priority: 1 })
    .returning().all()[0].id;
  const b = db.insert(schema.products)
    .values({ householdId: hid, ingredientId: flourId, shopId, name: "Brand B", packSize: 1000, priority: 2 })
    .returning().all()[0].id;
  return { a, b };
}

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
});

describe("consumption", () => {
  it("scales recipe amounts by servings/baseServings", () => {
    const recipe = { baseServings: 2, ingredients: [{ ingredientId: flourId, amount: 500 }] };
    expect(consumptionForRecipe(recipe, 4)).toEqual([{ ingredientId: flourId, amount: 1000 }]);
  });

  it("recording a cooked meal subtracts scaled amounts from stock", () => {
    const r = createRecipe(db, hid, {
      name: "Bread", baseServings: 2, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
    });
    // seed 2000g flour
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    recordCooked(db, hid, r.id, 4 /* servings */, null);
    expect(currentStock(db, hid, flourId)).toBe(1000); // 2000 - (500 * 4/2)
  });
});

describe("cook product attribution", () => {
  function bread() {
    return createRecipe(db, hid, {
      name: "Bread", baseServings: 1, notes: null,
      ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
    });
  }

  it("attributes the cook to the only in-stock product automatically", () => {
    const { a } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 }); // +1000 on a
    recordCooked(db, hid, bread().id, 1, null);
    expect(stockByProduct(db, hid).get(a)).toBe(500);
  });

  it("honors the user's allocation when multiple products are in stock", () => {
    const { a, b } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 });
    recordPurchase(db, hid, { productId: b, quantity: 1 });
    recordCooked(db, hid, bread().id, 1, null, new Map([[flourId, { productId: b, variantId: null }]]));
    const s = stockByProduct(db, hid);
    expect(s.get(a)).toBe(1000); // untouched
    expect(s.get(b)).toBe(500);  // depleted as chosen
  });

  it("falls back to the preferred (lowest-priority) product with no allocation", () => {
    const { a, b } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 });
    recordPurchase(db, hid, { productId: b, quantity: 1 });
    recordCooked(db, hid, bread().id, 1, null);
    const s = stockByProduct(db, hid);
    expect(s.get(a)).toBe(500);  // priority 1 wins
    expect(s.get(b)).toBe(1000);
  });

  it("cookChoices only asks when >1 product is in stock", () => {
    const { a, b } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 });
    const slotId = db.insert(schema.mealSlots)
      .values({ householdId: hid, name: "Dinner" }).returning().all()[0].id;
    const ev1 = db.insert(schema.mealEvents)
      .values({ householdId: hid, date: "2026-07-01", slotId, recipeId: bread().id, servings: 1 })
      .returning().all()[0];
    expect(cookChoices(db, hid, ev1.id)).toEqual([]); // one in stock → silent

    recordPurchase(db, hid, { productId: b, quantity: 1 });
    const choices = cookChoices(db, hid, ev1.id);
    expect(choices).toHaveLength(1);
    expect(choices[0].products.map((p) => p.id).sort()).toEqual([a, b].sort());
  });

  it("cookChoices asks for a single product that has variants", () => {
    const { a } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 });
    createVariant(db, hid, a, { name: "Fortified" });
    const slotId = db.insert(schema.mealSlots)
      .values({ householdId: hid, name: "Dinner" }).returning().all()[0].id;
    const ev = db.insert(schema.mealEvents)
      .values({ householdId: hid, date: "2026-07-01", slotId, recipeId: bread().id, servings: 1 })
      .returning().all()[0];
    const choices = cookChoices(db, hid, ev.id);
    expect(choices).toHaveLength(1); // one product, but it has a variant → still asks
    expect(choices[0].products[0].variants.map((v) => v.name)).toEqual(["Fortified"]);
  });

  it("records the chosen variant on the cook movement", () => {
    const { a } = seedFlourProducts(db, hid, flourId);
    recordPurchase(db, hid, { productId: a, quantity: 1 });
    const variantId = createVariant(db, hid, a, { name: "Fortified" })!.id;
    recordCooked(db, hid, bread().id, 1, null, new Map([[flourId, { productId: a, variantId }]]));
    const [m] = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.reason, "cooked")).all();
    expect(m.productId).toBe(a);
    expect(m.variantId).toBe(variantId);
  });

  it("attributes to the product whose soonest lot expires earlier, over priority", () => {
    const { a, b } = seedFlourProducts(db, hid, flourId); // a priority 1, b priority 2
    recordPurchase(db, hid, { productId: a, quantity: 1, expiresAt: "2026-09-01" });
    recordPurchase(db, hid, { productId: b, quantity: 1, expiresAt: "2026-08-15" }); // expires sooner
    recordCooked(db, hid, bread().id, 1, null);
    const s = stockByProduct(db, hid);
    expect(s.get(a)).toBe(1000); // untouched
    expect(s.get(b)).toBe(500);  // depleted: soonest-expiring wins over priority
  });

  it("cook against a product with 2 lots splits movements FEFO across purchaseIds", () => {
    const { a } = seedFlourProducts(db, hid, flourId);
    const soon = recordPurchase(db, hid, { productId: a, quantity: 1, expiresAt: "2026-08-10" }); // +1000, expires first
    const later = recordPurchase(db, hid, { productId: a, quantity: 1, expiresAt: "2026-09-10" }); // +1000
    recordCooked(db, hid, bread().id, 1, null); // amount 500, less than lot 1 (1000)
    const movements = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.reason, "cooked")).all();
    expect(movements).toHaveLength(1);
    expect(movements[0].purchaseId).toBe(soon.id);
    expect(movements[0].delta).toBe(-500);

    recordCooked(db, hid, bread().id, 1, null); // another 500: exhausts lot 1, none needed from lot 2 yet
    const movements2 = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.reason, "cooked")).all();
    expect(movements2).toHaveLength(2);
    expect(movements2[1].purchaseId).toBe(soon.id);

    recordCooked(db, hid, bread().id, 1, null); // now must draw from lot 2
    const movements3 = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.reason, "cooked")).all();
    expect(movements3).toHaveLength(3);
    expect(movements3[2].purchaseId).toBe(later.id);
    expect(stockByProduct(db, hid).get(a)).toBe(500); // 2000 - 1500
  });
});
