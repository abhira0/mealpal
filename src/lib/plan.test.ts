import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, listEvents, cookEvent, plannedConsumption, runOutDates } from "@/lib/plan";
import { currentStock } from "@/lib/stock";
import { createProduct } from "@/lib/products";
import { createVariant } from "@/lib/variants";
import { recordPurchase } from "@/lib/shopping";

let db: TestDb;
let hid: number;
let flourId: number;
let slotId: number;
let recipeId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
  slotId = createSlot(db, hid, "Dinner", "18:00").id;
  recipeId = createRecipe(db, hid, {
    name: "Bread", baseServings: 2, notes: null,
    ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
  }).id;
});

describe("meal plan", () => {
  it("adds planned events and lists them by date", () => {
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    const events = listEvents(db, hid, "2026-07-01", "2026-07-01");
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("planned");
  });

  it("sums planned consumption across the horizon (scaled by servings)", () => {
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 }); // 500g
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 4 }); // 1000g
    const map = plannedConsumption(db, hid, "2026-07-01", "2026-07-03");
    expect(map.get(flourId)).toBe(1500);
  });

  it("shelf life caps an ingredient to its window inside the horizon", () => {
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });  // day 0, 500g
    addEvent(db, hid, { date: "2026-07-10", slotId, recipeId, servings: 2 });  // day 9, 500g
    // horizon is 30d, but flour only keeps 3d → only the day-0 meal counts
    const map = plannedConsumption(db, hid, "2026-07-01", "2026-07-31", new Map([[flourId, 3]]));
    expect(map.get(flourId)).toBe(500);
  });

  it("dates the meal that drains stock below zero", () => {
    // 1200g on hand; 500g/meal. Meals on 1st, 2nd, 3rd → runs dry on the 3rd.
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-03", slotId, recipeId, servings: 2 });
    const out = runOutDates(db, hid, "2026-07-01", "2026-07-31", new Map([[flourId, 1200]]));
    expect(out.get(flourId)).toBe("2026-07-03");
  });

  it("cooking an event flips status and depletes stock once", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500); // 2000 - 500
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("cooked");
    // cooking again is a no-op (already cooked)
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);
  });
});

describe("direct items in a planner slot", () => {
  let shopId: number;
  let productId: number;
  beforeEach(() => {
    shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    productId = createProduct(db, hid, {
      ingredientId: flourId, shopId, name: "AP Flour 25lb", packSize: 1000, priority: 1, url: null,
    }).id;
  });

  it("a direct ingredient item plans + cooks, deducting its amount", () => {
    recordPurchase(db, hid, { productId, quantity: 1 }); // +1000g
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, ingredientId: flourId, amount: 200, servings: 1 });
    expect(ev.recipeId).toBeNull();
    expect(ev.amount).toBe(200);
    expect(plannedConsumption(db, hid, "2026-07-01", "2026-07-01").get(flourId)).toBe(200);
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(800); // 1000 - 200
  });

  it("a direct product item resolves amount from the variant's serving size and deducts that product", () => {
    const variantId = createVariant(db, hid, productId, { name: "Mega Omega", servingSize: 43, calories: 4 })!.id;
    recordPurchase(db, hid, { productId, quantity: 1 }); // +1000g on this product
    // 2 servings × 43g/packet = 86g
    const ev = addEvent(db, hid, { date: "2026-07-02", slotId, productId, variantId, servings: 2 });
    expect(ev.amount).toBe(86);
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(914); // 1000 - 86, attributed to this product
  });
});
