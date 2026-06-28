import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export function createSlot(db: Db, householdId: number, name: string, position = 0) {
  const [row] = db.insert(schema.mealSlots)
    .values({ householdId, name, position }).returning().all();
  return row;
}

export function listSlots(db: Db, householdId: number) {
  return db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId))
    .orderBy(asc(schema.mealSlots.position)).all();
}

export function deleteSlot(db: Db, householdId: number, id: number): boolean {
  const rows = db.delete(schema.mealSlots)
    .where(and(eq(schema.mealSlots.id, id), eq(schema.mealSlots.householdId, householdId)))
    .returning().all();
  return rows.length > 0;
}
