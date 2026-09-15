import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, listEvents, deleteEvent } from "@/lib/plan";
import { matchingDates, createRule, createRules, RuleItemError, topUpRules, listRules, updateRuleRecurrence } from "@/lib/rules";
import { schema } from "@/db";
import { eq } from "drizzle-orm";

let db: TestDb;
let hid: number;
let slotId: number;
let recipeId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  slotId = createSlot(db, hid, "Breakfast", "08:00").id;
  recipeId = createRecipe(db, hid, {
    name: "Smoothie", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
  }).id;
});

const base = { intervalN: 1, unit: "week" as const, daysOfWeek: "1111111", startDate: "2026-06-01", untilDate: null };

describe("matchingDates", () => {
  it("weekly on selected days only", () => {
    // Sun=0 ... Sat=6. Mon+Wed+Fri => index 1,3,5
    const r = { ...base, daysOfWeek: "0101010" };
    expect(matchingDates(r, "2026-06-01", "2026-06-07"))
      .toEqual(["2026-06-01", "2026-06-03", "2026-06-05"]); // Mon, Wed, Fri
  });

  it("every 2 weeks skips the off week", () => {
    const r = { ...base, intervalN: 2, daysOfWeek: "0000010" }; // Fridays
    expect(matchingDates(r, "2026-06-01", "2026-06-30"))
      .toEqual(["2026-06-05", "2026-06-19"]); // every other Friday
  });

  it("daily every 3 days from startDate", () => {
    const r = { ...base, unit: "day" as const, intervalN: 3 };
    expect(matchingDates(r, "2026-06-01", "2026-06-10"))
      .toEqual(["2026-06-01", "2026-06-04", "2026-06-07", "2026-06-10"]);
  });

  it("clamps to startDate and untilDate", () => {
    const r = { ...base, startDate: "2026-06-03", untilDate: "2026-06-05" };
    expect(matchingDates(r, "2026-06-01", "2026-06-10"))
      .toEqual(["2026-06-03", "2026-06-04", "2026-06-05"]);
  });
});

describe("direct-item rules", () => {
  it("materializes a repeating product with a resolved canonical amount", () => {
    const ingId = db.insert(schema.ingredients)
      .values({ householdId: hid, name: "Flour", canonicalUnit: "g" }).returning().all()[0].id;
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: ingId, shopId, name: "Brand A", packSize: 1000, priority: 1, servingSize: 50 })
      .returning().all()[0].id;
    createRule(db, hid, "2026-06-01", { slotId, productId, servings: 2, ...base, daysOfWeek: "0000010" }); // Fridays
    const evs = listEvents(db, hid, "2026-06-01", "2026-06-07");
    expect(evs).toHaveLength(1);
    expect(evs[0].productId).toBe(productId);
    expect(evs[0].amount).toBe(100); // 2 servings × 50 g/serving, resolved at rule creation
    expect(evs[0].ruleId).not.toBeNull();
  });

  it("materializes a repeating ingredient", () => {
    const ingId = db.insert(schema.ingredients)
      .values({ householdId: hid, name: "Salt", canonicalUnit: "g" }).returning().all()[0].id;
    createRule(db, hid, "2026-06-01", { slotId, ingredientId: ingId, amount: 5, servings: 1, ...base, daysOfWeek: "0000010" });
    const evs = listEvents(db, hid, "2026-06-01", "2026-06-07");
    expect(evs).toHaveLength(1);
    expect(evs[0].ingredientId).toBe(ingId);
    expect(evs[0].amount).toBe(5);
  });
});

describe("rule materialization", () => {
  it("backfills and is idempotent", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, daysOfWeek: "0101010" });
    const week = () => listEvents(db, hid, "2026-06-01", "2026-06-07");
    expect(week()).toHaveLength(3);
    // top-up again over the same window must not duplicate
    topUpRules(db, hid, "2026-06-01");
    expect(week()).toHaveLength(3);
    expect(week().every((e) => e.ruleId != null)).toBe(true);
  });

  it("skips entirely (no writes) when already materialized through the horizon", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, daysOfWeek: "0101010" });
    // createRule already materializes through horizonEnd("2026-06-01"); a
    // same-day top-up should be a no-op — no inserts, no update writes.
    const insertSpy = vi.spyOn(db, "insert");
    const updateSpy = vi.spyOn(db, "update");
    topUpRules(db, hid, "2026-06-01");
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    insertSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("does not overwrite a manual meal already on that day/slot", () => {
    addEvent(db, hid, { date: "2026-06-03", slotId, recipeId, servings: 9 });
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, daysOfWeek: "0101010" });
    const wed = listEvents(db, hid, "2026-06-03", "2026-06-03");
    expect(wed).toHaveLength(1);
    expect(wed[0].servings).toBe(9); // the manual one survived
    expect(wed[0].ruleId).toBeNull();
  });

  it("a second rule for a different recipe in the same slot still materializes", () => {
    const recipe2 = createRecipe(db, hid, {
      name: "Oats", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, unit: "day" });
    createRule(db, hid, "2026-06-01", { slotId, recipeId: recipe2, servings: 1, ...base, unit: "day", untilDate: "2026-06-03" });
    const days = listEvents(db, hid, "2026-06-01", "2026-06-03");
    expect(days.filter((e) => e.recipeId === recipe2)).toHaveLength(3);
    expect(days).toHaveLength(6); // both rules coexist per day
  });

  it("deleting a generated meal tombstones the day so top-up won't re-add it", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, daysOfWeek: "0101010" });
    const wed = listEvents(db, hid, "2026-06-03", "2026-06-03")[0];
    deleteEvent(db, hid, wed.id);
    expect(listEvents(db, hid, "2026-06-03", "2026-06-03")).toHaveLength(0);
    topUpRules(db, hid, "2026-06-10");
    expect(listEvents(db, hid, "2026-06-03", "2026-06-03")).toHaveLength(0); // stays gone
  });

  it("scope 'following' keeps the past, drops this day onward", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, unit: "day", daysOfWeek: "1111111" });
    const before = listEvents(db, hid, "2026-06-01", "2026-06-30").length;
    expect(before).toBe(30);
    const wed = listEvents(db, hid, "2026-06-10", "2026-06-10")[0];
    deleteEvent(db, hid, wed.id, "following");
    expect(listEvents(db, hid, "2026-06-09", "2026-06-09")).toHaveLength(1); // past kept
    expect(listEvents(db, hid, "2026-06-10", "2026-06-30")).toHaveLength(0); // this+future gone
    topUpRules(db, hid, "2026-06-30");
    expect(listEvents(db, hid, "2026-06-10", "2026-06-30")).toHaveLength(0); // clamped, stays gone
  });

  it("scope 'all' removes the whole series", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, unit: "day", daysOfWeek: "1111111" });
    const wed = listEvents(db, hid, "2026-06-10", "2026-06-10")[0];
    deleteEvent(db, hid, wed.id, "all");
    expect(listEvents(db, hid, "2026-06-01", "2026-06-30")).toHaveLength(0);
    topUpRules(db, hid, "2026-06-30");
    expect(listEvents(db, hid, "2026-06-01", "2026-06-30")).toHaveLength(0);
  });
});

describe("createRule cross-household guard", () => {
  it("rejects a slotId from another household", () => {
    const otherHid = seedHousehold(db);
    const otherSlot = createSlot(db, otherHid, "Dinner", "18:00").id;
    expect(() => createRule(db, hid, "2026-06-01", { slotId: otherSlot, recipeId, servings: 1, ...base }))
      .toThrow(/slot/i);
  });

  it("rejects a recipeId from another household", () => {
    const otherHid = seedHousehold(db);
    const otherRecipe = createRecipe(db, otherHid, {
      name: "Soup", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    expect(() => createRule(db, hid, "2026-06-01", { slotId, recipeId: otherRecipe, servings: 1, ...base }))
      .toThrow(/recipe/i);
  });

  it("rejects a productId from another household", () => {
    const otherHid = seedHousehold(db);
    const ingId = db.insert(schema.ingredients).values({ householdId: otherHid, name: "Flour", canonicalUnit: "g" }).returning().all()[0].id;
    const shopId = db.insert(schema.shops).values({ householdId: otherHid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: otherHid, ingredientId: ingId, shopId, name: "Brand A", packSize: 1000, priority: 1, servingSize: 50 })
      .returning().all()[0].id;
    expect(() => createRule(db, hid, "2026-06-01", { slotId, productId, servings: 1, ...base }))
      .toThrow(/product/i);
  });

  it("rejects an ingredientId from another household", () => {
    const otherHid = seedHousehold(db);
    const ingId = db.insert(schema.ingredients).values({ householdId: otherHid, name: "Salt", canonicalUnit: "g" }).returning().all()[0].id;
    expect(() => createRule(db, hid, "2026-06-01", { slotId, ingredientId: ingId, amount: 5, servings: 1, ...base }))
      .toThrow(/ingredient/i);
  });

  it("does not insert a rule or materialize events when a ref is foreign", () => {
    const otherHid = seedHousehold(db);
    const otherRecipe = createRecipe(db, otherHid, {
      name: "Soup", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    expect(() => createRule(db, hid, "2026-06-01", { slotId, recipeId: otherRecipe, servings: 1, ...base })).toThrow();
    expect(listRules(db, hid)).toHaveLength(0);
    expect(listEvents(db, hid, "2026-06-01", "2026-06-07")).toHaveLength(0);
  });
});

describe("listRules", () => {
  it("returns only this household's rules", () => {
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base });
    const otherHid = seedHousehold(db);
    const otherSlot = createSlot(db, otherHid, "Dinner", "18:00").id;
    const otherRecipe = createRecipe(db, otherHid, {
      name: "Soup", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    createRule(db, otherHid, "2026-06-01", { slotId: otherSlot, recipeId: otherRecipe, servings: 1, ...base });

    const mine = listRules(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].recipeId).toBe(recipeId);
  });
});

describe("updateRuleRecurrence", () => {
  it("re-spaces future occurrences and keeps cooked history", () => {
    const today = "2026-06-01";
    const rule = createRule(db, hid, today, {
      slotId, recipeId, servings: 1, ...base, unit: "day", intervalN: 3, startDate: today,
    });
    // pretend the first occurrence was cooked
    db.update(schema.mealEvents).set({ status: "cooked" })
      .where(eq(schema.mealEvents.date, today)).run();

    updateRuleRecurrence(db, hid, rule.id, today, { intervalN: 1, unit: "day", daysOfWeek: "1111111" });

    const dates = listEvents(db, hid, "2026-06-01", "2026-06-05").map((e) => e.date);
    expect(dates).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
    expect(listEvents(db, hid, today, today)[0].status).toBe("cooked");
  });

  it("moves every item added in the same meal, not just the edited one", () => {
    const today = "2026-06-01";
    const rice = createRecipe(db, hid, {
      name: "Rice", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    const a = createRule(db, hid, today, { slotId, recipeId, servings: 1, ...base, unit: "day", intervalN: 3, startDate: today });
    const b = createRule(db, hid, today, { slotId, recipeId: rice, servings: 1, ...base, unit: "day", intervalN: 3, startDate: today });

    updateRuleRecurrence(db, hid, a.id, today, { intervalN: 1, unit: "day", daysOfWeek: "1111111" });

    const rules = listRules(db, hid);
    expect(rules.find((r) => r.id === a.id)!.intervalN).toBe(1);
    expect(rules.find((r) => r.id === b.id)!.intervalN).toBe(1);
    expect(listEvents(db, hid, "2026-06-02", "2026-06-02").length).toBe(2); // both items on an off-cadence day
  });
});

describe("createRules (bulk add-meal, all-or-nothing)", () => {
  it("creates every rule (and its materialized events) in one call", () => {
    const today = "2026-06-01";
    const rice = createRecipe(db, hid, {
      name: "Rice", baseServings: 1, notes: null, ingredients: [], steps: [], media: [],
    }).id;
    const rules = createRules(db, hid, today, [
      { slotId, recipeId, servings: 1, ...base, startDate: today },
      { slotId, recipeId: rice, servings: 2, ...base, startDate: today },
    ]);
    expect(rules).toHaveLength(2);
    expect(listRules(db, hid)).toHaveLength(2);
    expect(listEvents(db, hid, today, today)).toHaveLength(2);
  });

  it("rolls back the whole batch when a later item is invalid, naming its index", () => {
    const today = "2026-06-01";
    const bogusSlotId = slotId + 999;
    const attempt = () => createRules(db, hid, today, [
      { slotId, recipeId, servings: 1, ...base, startDate: today },
      { slotId: bogusSlotId, recipeId, servings: 1, ...base, startDate: today },
    ]);
    expect(attempt).toThrow(RuleItemError);
    try {
      attempt();
    } catch (e) {
      expect(e).toBeInstanceOf(RuleItemError);
      expect((e as RuleItemError).index).toBe(1);
    }
    // Nothing from either failed attempt was left behind.
    expect(listRules(db, hid)).toHaveLength(0);
    expect(listEvents(db, hid, today, today)).toHaveLength(0);
  });
});
