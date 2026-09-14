import { describe, it, expect, beforeEach } from "vitest";
import { schema } from "@/db";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createSlot, listSlots, deleteSlot } from "@/lib/slots";

let db: TestDb;
let hid: number;
beforeEach(() => { db = makeTestDb(); hid = seedHousehold(db); });

describe("meal slots", () => {
  it("creates slots and lists them ordered by time of day", () => {
    createSlot(db, hid, "Dinner", "18:30");
    createSlot(db, hid, "Breakfast", "07:00");
    expect(listSlots(db, hid).map((s) => s.name)).toEqual(["Breakfast", "Dinner"]);
  });
  it("deletes a slot within the household only", () => {
    const s = createSlot(db, hid, "Snack", "15:00");
    const other = seedHousehold(db, "Other");
    expect(deleteSlot(db, other, s.id)).toEqual({ ok: true, deleted: false }); // wrong household
    expect(deleteSlot(db, hid, s.id)).toEqual({ ok: true, deleted: true });
    expect(listSlots(db, hid)).toHaveLength(0);
  });

  // meal_events.slot_id / meal_rules.slot_id / batches.slot_id are NOT NULL FKs
  // to meal_slots.id and the test db runs with foreign_keys=ON (like prod), so
  // an unguarded delete would throw a raw SqliteError instead of a friendly
  // 409-shaped result — this pins the guard added alongside deleteShop's.
  it("refuses to delete a slot a planned meal still uses", () => {
    const s = createSlot(db, hid, "Lunch", "12:00");
    db.insert(schema.mealEvents).values({ householdId: hid, date: "2026-01-01", slotId: s.id }).run();
    const result = deleteSlot(db, hid, s.id);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("meal") });
    expect(listSlots(db, hid)).toHaveLength(1); // not deleted
  });

  it("refuses to delete a slot a recurring rule still uses", () => {
    const s = createSlot(db, hid, "Dinner", "18:00");
    db.insert(schema.mealRules).values({ householdId: hid, slotId: s.id, startDate: "2026-01-01" }).run();
    const result = deleteSlot(db, hid, s.id);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("rule") });
  });

  it("refuses to delete a slot an active batch still uses", () => {
    const s = createSlot(db, hid, "Dinner", "18:00");
    db.insert(schema.batches).values({
      householdId: hid, slotId: s.id, label: "Chicken", cookedDate: "2026-01-01",
      mealsTotal: 4, mealsRemaining: 4,
    }).run();
    const result = deleteSlot(db, hid, s.id);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("batch") });
  });
});
