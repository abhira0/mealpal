import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, updateEvent, listEvents, cookEvent, uncookEvent, serveEvent, unserveEvent, deleteEvent, plannedConsumption, runOutDates, cookBatch, cookScope, ShortStock } from "@/lib/plan";
import { createRule } from "@/lib/rules";
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

  it("edits a planned event's servings, slot, and date in place", () => {
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    const other = createSlot(db, hid, "Lunch", "12:00").id;
    const updated = updateEvent(db, hid, ev.id, { date: "2026-07-05", slotId: other, recipeId, servings: 6 });
    expect(updated?.date).toBe("2026-07-05");
    expect(updated?.slotId).toBe(other);
    expect(updated?.servings).toBe(6);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")).toHaveLength(0);
    expect(listEvents(db, hid, "2026-07-05", "2026-07-05")).toHaveLength(1);
  });

  it("scoped edit of a repeating meal updates the rule and its occurrences", () => {
    const rule = createRule(db, hid, "2026-07-01", {
      slotId, recipeId, servings: 2, intervalN: 1, unit: "day",
      daysOfWeek: "1111111", startDate: "2026-07-01", untilDate: "2026-07-05",
    });
    const evs = listEvents(db, hid, "2026-07-01", "2026-07-05");
    expect(evs).toHaveLength(5);
    const third = evs[2]; // 2026-07-03

    updateEvent(db, hid, third.id, { date: third.date, slotId, recipeId, servings: 5 }, "following");
    const after = listEvents(db, hid, "2026-07-01", "2026-07-05");
    expect(after.map((e) => e.servings)).toEqual([2, 2, 5, 5, 5]);
    expect(db.select().from(schema.mealRules).all().find((r) => r.id === rule.id)?.servings).toBe(5);

    updateEvent(db, hid, third.id, { date: third.date, slotId, recipeId, servings: 1 }, "all");
    expect(listEvents(db, hid, "2026-07-01", "2026-07-05").map((e) => e.servings)).toEqual([1, 1, 1, 1, 1]);
  });

  it("cookScope cooks by recurring scope (one / following / all)", () => {
    const rule = createRule(db, hid, "2026-07-01", {
      slotId, recipeId, servings: 2, intervalN: 1, unit: "day",
      daysOfWeek: "1111111", startDate: "2026-07-01", untilDate: "2026-07-05",
    });
    void rule;
    const evs = listEvents(db, hid, "2026-07-01", "2026-07-05");
    expect(evs).toHaveLength(5);
    const statuses = () => listEvents(db, hid, "2026-07-01", "2026-07-05").map((e) => e.status);

    // one: only the third day cooks (force → no stock needed).
    cookScope(db, hid, evs[2].id, "one", undefined, true);
    expect(statuses()).toEqual(["planned", "planned", "cooked", "planned", "planned"]);

    // following: from day 2 onward, still-planned ones cook (day 3 already cooked).
    cookScope(db, hid, evs[1].id, "following", undefined, true);
    expect(statuses()).toEqual(["planned", "cooked", "cooked", "cooked", "cooked"]);

    // all: the remaining planned day 1 cooks too.
    cookScope(db, hid, evs[0].id, "all", undefined, true);
    expect(statuses()).toEqual(["cooked", "cooked", "cooked", "cooked", "cooked"]);
  });

  it("cookScope without force throws ShortStock and rolls back the whole batch", () => {
    createRule(db, hid, "2026-07-01", {
      slotId, recipeId, servings: 2, intervalN: 1, unit: "day",
      daysOfWeek: "1111111", startDate: "2026-07-01", untilDate: "2026-07-03",
    });
    const evs = listEvents(db, hid, "2026-07-01", "2026-07-03");
    expect(() => cookScope(db, hid, evs[0].id, "all")).toThrow(ShortStock);
    // nothing committed
    expect(listEvents(db, hid, "2026-07-01", "2026-07-03").every((e) => e.status === "planned")).toBe(true);
  });

  it("cookEvent rolls back all movements if a forced failure hits the third consumption line", () => {
    // A recipe with 3 ingredients, none in stock, so cooking writes one
    // unattributed "cooked" movement per line, in ingredient order.
    const sugarId = db.insert(schema.ingredients)
      .values({ householdId: hid, name: "Sugar", canonicalUnit: "g" }).returning().all()[0].id;
    const eggId = db.insert(schema.ingredients)
      .values({ householdId: hid, name: "Egg", canonicalUnit: "g" }).returning().all()[0].id;
    const threeIngredientRecipe = createRecipe(db, hid, {
      name: "Cake", baseServings: 2, notes: null,
      ingredients: [
        { ingredientId: flourId, amount: 200 },
        { ingredientId: sugarId, amount: 100 },
        { ingredientId: eggId, amount: 50 },
      ], steps: [], media: [],
    }).id;
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId: threeIngredientRecipe, servings: 2 });

    // Force the third movement insert to fail mid-transaction.
    const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
    sqlite.exec(`
      CREATE TRIGGER block_third_movement
      BEFORE INSERT ON stock_movements
      WHEN (SELECT COUNT(*) FROM stock_movements) = 2
      BEGIN
        SELECT RAISE(ABORT, 'forced failure for test');
      END;
    `);

    expect(() => cookEvent(db, hid, ev.id)).toThrow();

    sqlite.exec(`DROP TRIGGER block_third_movement;`);

    // The first two movements from this cook must have rolled back too, and
    // the event must still be planned (not stuck between planned and cooked).
    expect(db.select().from(schema.stockMovements).all()).toHaveLength(0);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].status).toBe("planned");
  });

  it("refuses to edit a cooked/served event (returns null)", () => {
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    cookEvent(db, hid, ev.id);
    expect(updateEvent(db, hid, ev.id, { date: "2026-07-01", slotId, recipeId, servings: 4 })).toBeNull();
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01")[0].servings).toBe(2); // unchanged
  });

  it("rejects addEvent/updateEvent refs (slot, recipe, ingredient, product) from another household", () => {
    const otherHid = seedHousehold(db);
    const otherSlot = createSlot(db, otherHid, "Dinner", "18:00").id;
    const otherIngredient = db.insert(schema.ingredients)
      .values({ householdId: otherHid, name: "Sugar", canonicalUnit: "g" }).returning().all()[0].id;
    const otherRecipe = createRecipe(db, otherHid, {
      name: "Cake", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;

    expect(() => addEvent(db, hid, { date: "2026-07-01", slotId: otherSlot, servings: 1 }))
      .toThrow(/slot not found/);
    expect(() => addEvent(db, hid, { date: "2026-07-01", slotId, recipeId: otherRecipe, servings: 1 }))
      .toThrow(/recipe not found/);
    expect(() => addEvent(db, hid, { date: "2026-07-01", slotId, ingredientId: otherIngredient, amount: 10, servings: 1 }))
      .toThrow(/ingredient not found/);

    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    expect(() => updateEvent(db, hid, ev.id, { date: "2026-07-01", slotId: otherSlot, recipeId, servings: 2 }))
      .toThrow(/slot not found/);
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

  // Regression for mealpal-aqc: endSeriesFrom/deleteRule only ever remove
  // *planned* rows, so a cooked/served anchor always survives scope
  // 'following'/'all' — it must keep both its status and its movements.
  it("deleting a cooked recurring meal with scope 'following' keeps the anchor cooked with its stock intact", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    createRule(db, hid, "2026-07-01", {
      slotId, recipeId, servings: 2, intervalN: 1, unit: "day",
      daysOfWeek: "1111111", startDate: "2026-07-01", untilDate: "2026-07-05",
    });
    const anchor = listEvents(db, hid, "2026-07-03", "2026-07-03")[0];
    cookEvent(db, hid, anchor.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);

    deleteEvent(db, hid, anchor.id, "following");

    const stillThere = listEvents(db, hid, "2026-07-03", "2026-07-03")[0];
    expect(stillThere).toBeDefined();
    expect(stillThere.status).toBe("cooked");
    expect(currentStock(db, hid, flourId)).toBe(1500); // movement kept, not reversed
    // future planned occurrences of the series are gone
    expect(listEvents(db, hid, "2026-07-04", "2026-07-05")).toHaveLength(0);
  });

  it("deleting a cooked recurring meal with scope 'all' keeps the anchor cooked with its stock intact", () => {
    db.insert(schema.stockMovements)
      .values({ householdId: hid, ingredientId: flourId, delta: 2000, reason: "manual" }).run();
    createRule(db, hid, "2026-07-01", {
      slotId, recipeId, servings: 2, intervalN: 1, unit: "day",
      daysOfWeek: "1111111", startDate: "2026-07-01", untilDate: "2026-07-05",
    });
    const anchor = listEvents(db, hid, "2026-07-03", "2026-07-03")[0];
    cookEvent(db, hid, anchor.id);
    expect(currentStock(db, hid, flourId)).toBe(1500);

    deleteEvent(db, hid, anchor.id, "all");

    const stillThere = listEvents(db, hid, "2026-07-03", "2026-07-03")[0];
    expect(stillThere).toBeDefined();
    expect(stillThere.status).toBe("cooked");
    expect(currentStock(db, hid, flourId)).toBe(1500); // movement kept, not reversed
    // planned occurrences elsewhere in the series are gone
    expect(listEvents(db, hid, "2026-07-01", "2026-07-02")).toHaveLength(0);
    expect(listEvents(db, hid, "2026-07-04", "2026-07-05")).toHaveLength(0);
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

describe("cookBatch (cook once, cover N planned days)", () => {
  let productId: number;
  beforeEach(() => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
    productId = createProduct(db, hid, {
      ingredientId: flourId, shopId, name: "AP Flour", packSize: 3000, priority: 1, url: null,
    }).id;
  });

  it("cooks the next N matching planned days and depletes stock per day, leaving others planned", () => {
    recordPurchase(db, hid, { productId, quantity: 1 }); // +3000g
    const lunch = createSlot(db, hid, "Lunch", "12:00").id;
    const d1 = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 }); // 500g
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });            // 500g
    addEvent(db, hid, { date: "2026-07-03", slotId, recipeId, servings: 2 });            // stays planned
    addEvent(db, hid, { date: "2026-07-01", slotId: lunch, recipeId, servings: 2 });     // other slot: untouched

    const cooked = cookBatch(db, hid, d1.id, 2);
    expect(cooked).toHaveLength(2);
    const dinners = listEvents(db, hid, "2026-07-01", "2026-07-03").filter((e) => e.slotId === slotId);
    expect(dinners.map((e) => e.status)).toEqual(["cooked", "cooked", "planned"]);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-01").find((e) => e.slotId === lunch)?.status).toBe("planned");
    expect(currentStock(db, hid, flourId)).toBe(2000); // 3000 - 2×500
  });

  it("rolls the whole batch back when a later day is short on stock (no force)", () => {
    // Only enough for one day; day 2's stock check fails → transaction rolls back.
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Aldi" }).returning().all()[0].id;
    const small = createProduct(db, hid, { ingredientId: flourId, shopId, name: "Flour 500", packSize: 500, priority: 2, url: null }).id;
    recordPurchase(db, hid, { productId: small, quantity: 1 }); // +500g, exactly one meal
    const d1 = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    addEvent(db, hid, { date: "2026-07-02", slotId, recipeId, servings: 2 });

    expect(() => cookBatch(db, hid, d1.id, 2)).toThrow(ShortStock);
    expect(listEvents(db, hid, "2026-07-01", "2026-07-02").map((e) => e.status)).toEqual(["planned", "planned"]);
    expect(currentStock(db, hid, flourId)).toBe(500); // untouched
  });
});
