import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent, listEvents, deleteEvent } from "@/lib/plan";
import { matchingDates, createRule, topUpRules } from "@/lib/rules";

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

  it("does not overwrite a manual meal already on that day/slot", () => {
    addEvent(db, hid, { date: "2026-06-03", slotId, recipeId, servings: 9 });
    createRule(db, hid, "2026-06-01", { slotId, recipeId, servings: 1, ...base, daysOfWeek: "0101010" });
    const wed = listEvents(db, hid, "2026-06-03", "2026-06-03");
    expect(wed).toHaveLength(1);
    expect(wed[0].servings).toBe(9); // the manual one survived
    expect(wed[0].ruleId).toBeNull();
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
