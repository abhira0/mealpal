import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createSlot, listSlots, deleteSlot } from "@/lib/slots";

let db: TestDb;
let hid: number;
beforeEach(() => { db = makeTestDb(); hid = seedHousehold(db); });

describe("meal slots", () => {
  it("creates slots and lists them ordered by position", () => {
    createSlot(db, hid, "Dinner", 2);
    createSlot(db, hid, "Breakfast", 0);
    expect(listSlots(db, hid).map((s) => s.name)).toEqual(["Breakfast", "Dinner"]);
  });
  it("deletes a slot within the household only", () => {
    const s = createSlot(db, hid, "Snack", 5);
    const other = seedHousehold(db, "Other");
    expect(deleteSlot(db, other, s.id)).toBe(false); // wrong household
    expect(deleteSlot(db, hid, s.id)).toBe(true);
    expect(listSlots(db, hid)).toHaveLength(0);
  });
});
