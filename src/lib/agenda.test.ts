import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { packBatch, eatFromBatch } from "@/lib/batches";
import { agendaDays } from "@/lib/agenda";

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
    expect(day.eatenCount).toBe(1); // only the cooked one
    expect(day.meals[0].ruleId).toBeNull(); // one-off events have no rule origin
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
    expect(days[0].eatenCount).toBe(0);

    eatFromBatch(db, hid, batch.id, "2026-08-09");

    days = agendaDays(db, hid, "2026-08-09", "2026-08-09", "2026-08-09");
    meal = days[0].meals[0];
    expect(meal.eatenFromBatchToday).toBe(true);
    expect(meal.mealsRemaining).toBe(2); // updated remaining after eating
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
