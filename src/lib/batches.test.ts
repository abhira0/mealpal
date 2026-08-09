import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";

let db: TestDb; let hid: number; let slotId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Lunch", timeOfDay: "12:00" }).returning().all()[0].id;
});

describe("batch tables", () => {
  it("can insert a batch with items and an eaten row", () => {
    const batch = db.insert(schema.batches).values({
      householdId: hid, slotId, label: "Biryani lunch", cookedDate: "2026-08-09",
      mealsTotal: 4, mealsRemaining: 4,
    }).returning().all()[0];
    expect(batch.id).toBeGreaterThan(0);
    db.insert(schema.batchItems).values({ batchId: batch.id, recipeId: null, amount: 1 }).run();
    db.insert(schema.batchEaten).values({ householdId: hid, batchId: batch.id, date: "2026-08-09" }).run();
    expect(db.select().from(schema.batchItems).all()).toHaveLength(1);
    expect(db.select().from(schema.batchEaten).all()).toHaveLength(1);
  });
});
