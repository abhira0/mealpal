import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { packBatch, eatFromBatch } from "@/lib/batches";
import { recordPurchase } from "@/lib/shopping";
import { agendaDays, nextCooks } from "@/lib/agenda";

let db: TestDb;
let hid: number;
let lunchSlot: number;
let dinnerSlot: number;

beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  lunchSlot = db.insert(schema.mealSlots).values({ householdId: hid, name: "Lunch", timeOfDay: "12:00" }).returning().all()[0].id;
  dinnerSlot = db.insert(schema.mealSlots).values({ householdId: hid, name: "Dinner", timeOfDay: "19:00" }).returning().all()[0].id;
});

function makeRecipe(name: string) {
  return createRecipe(db, hid, {
    name, baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
  }).id;
}

describe("agendaDays", () => {
  it("returns a day's meals ordered by slot time with names, statuses, and counts", () => {
    const dinnerRecipe = makeRecipe("Biryani");
    const lunchRecipe = makeRecipe("Sandwich");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: dinnerSlot, recipeId: dinnerRecipe, servings: 1, status: "planned",
    }).run();
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: lunchSlot, recipeId: lunchRecipe, servings: 1, status: "cooked",
    }).run();

    const days = agendaDays(db, hid, "2026-08-09", "2026-08-09", "2026-08-09");
    expect(days).toHaveLength(1);
    const day = days[0];
    expect(day.date).toBe("2026-08-09");
    expect(day.totalCount).toBe(2);
    expect(day.meals.map((m) => m.name)).toEqual(["Sandwich", "Biryani"]); // lunch (12:00) before dinner (19:00)
    expect(day.meals[0].status).toBe("cooked");
    expect(day.meals[1].status).toBe("planned");
    expect(day.meals[0].phase).toBe("served"); // cooked event -> served
    expect(day.meals[1].phase).toBe("planned"); // untouched rotation event -> planned
    expect(day.eatenCount).toBe(1); // only the cooked one
    expect(day.meals[0].ruleId).toBeNull(); // one-off events have no rule origin
    expect(day.meals[0].recipeId).toBe(lunchRecipe); // recipe meals expose recipeId for name linking
    expect(day.meals[0].productId).toBeNull();
    expect(day.meals[0].ingredientId).toBeNull();
  });

  it("overlays an active batch onto its slot's meal, and eatenFromBatchToday flips after eating", () => {
    const recipeId = makeRecipe("Sabji");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: lunchSlot, recipeId, servings: 1, status: "planned",
    }).run();
    const batch = packBatch(db, hid, {
      slotId: lunchSlot, label: "Sabji batch", cookedDate: "2026-08-08", mealsTotal: 3, items: [],
    });

    let days = agendaDays(db, hid, "2026-08-09", "2026-08-09", "2026-08-09");
    let meal = days[0].meals[0];
    expect(meal.batchBacked).toBe(true);
    expect(meal.batchId).toBe(batch.id);
    expect(meal.mealsRemaining).toBe(3);
    expect(meal.eatenFromBatchToday).toBe(false);
    expect(meal.phase).toBe("cooked"); // batch-backed, not eaten today -> cooked
    expect(days[0].eatenCount).toBe(0);

    eatFromBatch(db, hid, batch.id, "2026-08-09");

    days = agendaDays(db, hid, "2026-08-09", "2026-08-09", "2026-08-09");
    meal = days[0].meals[0];
    expect(meal.eatenFromBatchToday).toBe(true);
    expect(meal.mealsRemaining).toBe(2); // updated remaining after eating
    expect(meal.phase).toBe("served"); // eaten from batch today -> served
    expect(days[0].eatenCount).toBe(1);
  });

  it("flags the day a batch runs out (today + mealsRemaining days) for its slot", () => {
    packBatch(db, hid, {
      slotId: dinnerSlot, label: "Chapathi batch", cookedDate: "2026-08-09", mealsTotal: 2, items: [],
    });

    const days = agendaDays(db, hid, "2026-08-09", "2026-08-12", "2026-08-09");
    const byDate = new Map(days.map((d) => [d.date, d]));

    expect(byDate.get("2026-08-11")!.cookFlags).toEqual([
      { slotId: dinnerSlot, slotName: "Dinner", label: "Chapathi batch" },
    ]);
    expect(byDate.get("2026-08-09")!.cookFlags).toEqual([]);
    expect(byDate.get("2026-08-10")!.cookFlags).toEqual([]);
    expect(byDate.get("2026-08-12")!.cookFlags).toEqual([]);
  });

  it("projects a packed batch as a synthetic meal row on every day of its coverage window, and defers to a real event if one exists", () => {
    const batch = packBatch(db, hid, {
      slotId: lunchSlot, label: "Rice Bowl", cookedDate: "2026-08-09", mealsTotal: 3, items: [],
    });

    // a real Lunch event on the middle covered day should suppress the synthetic row there
    const middleRecipe = makeRecipe("Actual Lunch");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-10", slotId: lunchSlot, recipeId: middleRecipe, servings: 1, status: "planned",
    }).run();

    const days = agendaDays(db, hid, "2026-08-09", "2026-08-13", "2026-08-09");
    const byDate = new Map(days.map((d) => [d.date, d]));

    const day0 = byDate.get("2026-08-09")!;
    expect(day0.meals).toHaveLength(1);
    expect(day0.meals[0]).toMatchObject({
      eventId: null, batchBacked: true, batchId: batch.id, name: "Rice Bowl", status: "planned", phase: "cooked",
    });

    const day1 = byDate.get("2026-08-10")!;
    expect(day1.meals).toHaveLength(1); // real event wins, no duplicate synthetic row
    expect(day1.meals[0].eventId).not.toBeNull();
    expect(day1.meals[0].name).toBe("Actual Lunch");

    const day2 = byDate.get("2026-08-11")!;
    expect(day2.meals).toHaveLength(1);
    expect(day2.meals[0]).toMatchObject({ eventId: null, batchBacked: true, batchId: batch.id, name: "Rice Bowl" });

    // cook-flag lands the day AFTER the coverage window (cookedDate + mealsTotal)
    expect(byDate.get("2026-08-12")!.cookFlags).toEqual([
      { slotId: lunchSlot, slotName: "Lunch", label: "Rice Bowl" },
    ]);
    expect(byDate.get("2026-08-13")!.cookFlags).toEqual([]);
  });

  it("flags a planned meal missing stock, leaves an in-stock planned meal alone, and never flags cooked/served/batch rows", () => {
    // Flour: no product at all -> no stock possible for the Bread recipe.
    const flourId = db.insert(schema.ingredients).values({ householdId: hid, name: "Flour", canonicalUnit: "g" }).returning().all()[0].id;
    const bread = createRecipe(db, hid, {
      name: "Bread", baseServings: 1, notes: null, ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
    }).id;
    const breadEvent = db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: dinnerSlot, recipeId: bread, servings: 1, status: "planned",
    }).returning().all()[0];

    // Rice: has a purchased, in-stock product.
    const riceId = db.insert(schema.ingredients).values({ householdId: hid, name: "Rice", canonicalUnit: "g" }).returning().all()[0].id;
    const rice = createRecipe(db, hid, {
      name: "Rice Bowl", baseServings: 1, notes: null, ingredients: [{ ingredientId: riceId, amount: 200 }], steps: [], media: [],
    }).id;
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const riceProduct = db.insert(schema.products).values({
      householdId: hid, ingredientId: riceId, shopId, name: "Rice Brand", packSize: 1000, priority: 1,
    }).returning().all()[0].id;
    recordPurchase(db, hid, { productId: riceProduct, quantity: 1 });
    const riceEvent = db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: lunchSlot, recipeId: rice, servings: 1, status: "planned",
    }).returning().all()[0];

    // A cooked/served event whose ingredient also has no stock — should never be flagged.
    const cookedRecipe = makeRecipe("Already Cooked");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: lunchSlot, recipeId: cookedRecipe, servings: 1, status: "cooked",
    }).run();

    // A batch row (own slot, so it isn't suppressed by the real bread/rice
    // events above) — never flagged even though nothing was purchased for it.
    const batchSlot = db.insert(schema.mealSlots).values({ householdId: hid, name: "Snack", timeOfDay: "16:00" }).returning().all()[0].id;
    packBatch(db, hid, { slotId: batchSlot, label: "Batch Meal", cookedDate: "2026-08-08", mealsTotal: 3, items: [] });

    const days = agendaDays(db, hid, "2026-08-09", "2026-08-09", "2026-08-09");
    const meals = days[0].meals;

    const breadMeal = meals.find((m) => m.eventId === breadEvent.id)!;
    expect(breadMeal.outOfStock).toBe(true);
    expect(breadMeal.missingItems).toContain("Flour");

    const riceMeal = meals.find((m) => m.eventId === riceEvent.id)!;
    expect(riceMeal.outOfStock).toBe(false);
    expect(riceMeal.missingItems).toEqual([]);

    const cookedMeal = meals.find((m) => m.phase === "served" && m.name === "Already Cooked")!;
    expect(cookedMeal.outOfStock).toBe(false);
    expect(cookedMeal.missingItems).toEqual([]);

    const batchMeal = meals.find((m) => m.batchBacked)!;
    expect(batchMeal.outOfStock).toBe(false);
    expect(batchMeal.missingItems).toEqual([]);
  });

  it("returns an empty day for a date in range with no events", () => {
    const days = agendaDays(db, hid, "2026-08-09", "2026-08-10", "2026-08-09");
    expect(days).toHaveLength(2);
    expect(days[1].date).toBe("2026-08-10");
    expect(days[1].meals).toEqual([]);
    expect(days[1].totalCount).toBe(0);
    expect(days[1].eatenCount).toBe(0);
    expect(days[1].cookFlags).toEqual([]);
  });
});

describe("nextCooks", () => {
  it("returns one entry per slot with an active batch, sorted by cook date", () => {
    packBatch(db, hid, {
      slotId: lunchSlot, label: "Rice Bowl", cookedDate: "2026-08-09", mealsTotal: 4, items: [],
    });
    packBatch(db, hid, {
      slotId: dinnerSlot, label: "Chicken Curry", cookedDate: "2026-08-09", mealsTotal: 6, items: [],
    });

    const result = nextCooks(db, hid, "2026-08-09");
    expect(result).toEqual([
      { slotId: lunchSlot, slotName: "Lunch", label: "Rice Bowl", cookDate: "2026-08-13", daysAway: 4 },
      { slotId: dinnerSlot, slotName: "Dinner", label: "Chicken Curry", cookDate: "2026-08-15", daysAway: 6 },
    ]);
  });

  it("keeps only the soonest-cooking batch when a slot has multiple active batches", () => {
    packBatch(db, hid, {
      slotId: lunchSlot, label: "Older", cookedDate: "2026-08-05", mealsTotal: 10, items: [],
    });
    packBatch(db, hid, {
      slotId: lunchSlot, label: "Newer", cookedDate: "2026-08-09", mealsTotal: 2, items: [],
    });

    const result = nextCooks(db, hid, "2026-08-09");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Newer");
    expect(result[0].cookDate).toBe("2026-08-11");
  });

  it("returns an empty array when there are no active batches", () => {
    expect(nextCooks(db, hid, "2026-08-09")).toEqual([]);
  });

  it("surfaces a recurring recipe meal's next planned occurrence as a prep entry", () => {
    const oats = makeRecipe("Overnight Oats");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-10", slotId: lunchSlot, recipeId: oats, servings: 1, status: "planned",
    }).run();
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-11", slotId: lunchSlot, recipeId: oats, servings: 1, status: "planned",
    }).run();

    const result = nextCooks(db, hid, "2026-08-09");
    expect(result).toContainEqual({
      slotId: lunchSlot, slotName: "Lunch", label: "Overnight Oats", cookDate: "2026-08-10", daysAway: 1,
    });
  });

  it("uses the earliest planned occurrence and ignores already-cooked recipe events", () => {
    const oats = makeRecipe("Overnight Oats");
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-09", slotId: lunchSlot, recipeId: oats, servings: 1, status: "cooked",
    }).run(); // today already done -> should not be the prep date
    db.insert(schema.mealEvents).values({
      householdId: hid, date: "2026-08-12", slotId: lunchSlot, recipeId: oats, servings: 1, status: "planned",
    }).run();

    const result = nextCooks(db, hid, "2026-08-09");
    const oatsEntry = result.find((r) => r.label === "Overnight Oats");
    expect(oatsEntry?.cookDate).toBe("2026-08-12");
  });
});
