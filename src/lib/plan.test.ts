import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, listEvents, cookEvent, uncookEvent, serveEvent, unserveEvent, deleteEvent, plannedConsumption, runOutDates } from "@/lib/plan";
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

  it("dates the meal that uses the last of the stock, not the first unmet one", () => {
    // 1000g on hand; the 2nd's meal drains it to exactly zero → out on the 2nd.
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-03", slotId, recipeId, servings: 2 });
    const out = runOutDates(db, hid, "2026-07-01", "2026-07-31", new Map([[flourId, 1000]]));
    expect(out.get(flourId)).toBe("2026-07-02");
  });

  it("expiry zeroes remaining stock: run-out is the first meal after the expiry date", () => {
    // 2000g on hand — enough for all four meals — but it expires on the 2nd.
    addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-03", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-04", slotId, recipeId, servings: 2 });
    const out = runOutDates(db, hid, "2026-07-01", "2026-07-31",
      new Map([[flourId, 2000]]), new Map([[flourId, "2026-07-02"]]));
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

  it("removing a cooked event deletes it and backs out its stock movements", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);
    deleteEvent(db, hid, ev.id);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")).toHaveLength(0);
    expect(currentStock(db, hid, flourId)).toBe(2000); // cook movement reversed
  });

  it("removing a served event also backs out its stock movements", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    serveEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);
    deleteEvent(db, hid, ev.id);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")).toHaveLength(0);
    expect(currentStock(db, hid, flourId)).toBe(2000);
  });

  it("serving a planned event depletes stock once and sets status served", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    serveEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500); // 2000 - 500
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("served");
    // serving again is a no-op (already served)
    serveEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);
  });

  it("serving an already-cooked event just flips status, without depleting stock again", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500); // 2000 - 500, depleted at cook time
    serveEvent(db, hid, ev.id);
    expect(currentStock(db, hid, flourId)).toBe(1500); // unchanged — no second depletion
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("served");
  });

  it("unserveEvent returns a directly-served event to planned, backing its stock out", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    serveEvent(db, hid, ev.id); // planned → served (depletes stock as part of serving)
    expect(currentStock(db, hid, flourId)).toBe(1500);
    unserveEvent(db, hid, ev.id);
    // Never explicitly cooked ahead → undo goes all the way back to planned.
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("planned");
    expect(currentStock(db, hid, flourId)).toBe(2000); // serve's stock backed out
  });

  it("unserveEvent returns a cooked-ahead-then-served event to cooked, keeping its stock movements", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id, undefined, true); // explicit cook-ahead → 'cooked'
    serveEvent(db, hid, ev.id); // cooked → served (no second depletion)
    expect(currentStock(db, hid, flourId)).toBe(1500);
    unserveEvent(db, hid, ev.id);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("cooked");
    expect(currentStock(db, hid, flourId)).toBe(1500); // stock stays depleted
    // uncookEvent then reverses the stock, back to planned
    uncookEvent(db, hid, ev.id);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("planned");
    expect(currentStock(db, hid, flourId)).toBe(2000);
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

  it("listEvents carries the variant name so clients don't refetch it", () => {
    const variantId = createVariant(db, hid, productId, { name: "Mega Omega", servingSize: 43, calories: 4 })!.id;
    addEvent(db, hid, { date: "2026-07-02", slotId, productId, variantId, servings: 1 });
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });
    const events = listEvents(db, hid, "2026-07-02", "2026-07-02");
    expect(events.find((e) => e.variantId === variantId)?.variantName).toBe("Mega Omega");
    expect(events.find((e) => e.recipeId != null)?.variantName).toBeNull();
  });

  it("a product planned without a variant records the cook-time pick on the movement, leaving the event as the plan", () => {
    const variantId = createVariant(db, hid, productId, { name: "Mega Omega", servingSize: 43, calories: 4 })!.id;
    recordPurchase(db, hid, { productId, quantity: 1 }); // +1000g
    const ev = addEvent(db, hid, { date: "2026-07-02", slotId, productId, servings: 1 }); // no variant
    expect(ev.variantId).toBeNull();
    expect(ev.amount).toBe(1); // provisional: serving size unknown until a variant is picked
    // cook picker resolves the variant, keyed by the product's ingredient
    cookEvent(db, hid, ev.id, new Map([[flourId, { productId, variantId }]]));
    const cooked = listEvents(db, hid, "2026-07-02", "2026-07-02")[0];
    expect(cooked.status).toBe("cooked");
    // The event stays the plan — the pick lives on the stock movement, so undo
    // (uncookEvent) returns cleanly and re-serving asks the variant again.
    expect(cooked.variantId).toBeNull();
    expect(currentStock(db, hid, flourId)).toBe(957); // 1000 - 43 (variant serving size)
    // Undo restores the clean planned state.
    uncookEvent(db, hid, ev.id);
    const planned = listEvents(db, hid, "2026-07-02", "2026-07-02")[0];
    expect(planned.status).toBe("planned");
    expect(planned.variantId).toBeNull();
    expect(currentStock(db, hid, flourId)).toBe(1000); // movement backed out
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
