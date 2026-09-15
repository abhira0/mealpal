import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

/** 24h HH:MM, zero-padded (e.g. "09:00", not "9:00"), so lexical sort == time order. */
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeOfDay(value: string): boolean {
  return TIME_OF_DAY_RE.test(value);
}

export function createSlot(db: Db, householdId: number, name: string, timeOfDay = "12:00") {
  const [row] = db.insert(schema.mealSlots)
    .values({ householdId, name, timeOfDay }).returning().all();
  return row;
}

export function listSlots(db: Db, householdId: number) {
  return db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId))
    .orderBy(asc(schema.mealSlots.timeOfDay)).all();
}

export function updateSlot(
  db: Db,
  householdId: number,
  id: number,
  values: { name: string; timeOfDay?: string },
) {
  const [row] = db.update(schema.mealSlots)
    .set({ name: values.name, ...(values.timeOfDay !== undefined ? { timeOfDay: values.timeOfDay } : {}) })
    .where(and(eq(schema.mealSlots.id, id), eq(schema.mealSlots.householdId, householdId)))
    .returning().all();
  return row;
}

/** Result of a delete that may be blocked by rows referencing it. */
export type DeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: string };

export function deleteSlot(db: Db, householdId: number, id: number): DeleteResult {
  // meal_events.slot_id, meal_rules.slot_id, and batches.slot_id all
  // FK-reference meal_slots.id NOT NULL with foreign_keys=ON, so an unchecked
  // delete throws a raw SqliteError instead of a friendly message (mirrors
  // deleteShop's guard in lib/shops.ts).
  const eventCount = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.householdId, householdId), eq(schema.mealEvents.slotId, id)))
    .all().length;
  if (eventCount > 0) {
    return { ok: false, reason: `Can't delete: ${eventCount} planned ${eventCount === 1 ? "meal uses" : "meals use"} this slot.` };
  }
  const ruleCount = db.select().from(schema.mealRules)
    .where(and(eq(schema.mealRules.householdId, householdId), eq(schema.mealRules.slotId, id)))
    .all().length;
  if (ruleCount > 0) {
    return { ok: false, reason: `Can't delete: ${ruleCount} recurring ${ruleCount === 1 ? "rule uses" : "rules use"} this slot.` };
  }
  const batchCount = db.select().from(schema.batches)
    .where(and(eq(schema.batches.householdId, householdId), eq(schema.batches.slotId, id)))
    .all().length;
  if (batchCount > 0) {
    return { ok: false, reason: `Can't delete: ${batchCount} ${batchCount === 1 ? "batch uses" : "batches use"} this slot.` };
  }
  const rows = db.delete(schema.mealSlots)
    .where(and(eq(schema.mealSlots.id, id), eq(schema.mealSlots.householdId, householdId)))
    .returning().all();
  return { ok: true, deleted: rows.length > 0 };
}
