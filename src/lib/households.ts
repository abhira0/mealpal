import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { generateCalendarToken } from "@/lib/calendar";

type Db = BetterSQLite3Database<typeof schema>;

export function getCalendarToken(db: Db, householdId: number): string | null {
  const [row] = db.select({ calendarToken: schema.households.calendarToken })
    .from(schema.households).where(eq(schema.households.id, householdId)).all();
  return row?.calendarToken ?? null;
}

/** Overwrites the household's calendar feed token; the old feed URL 404s immediately after. */
export function regenerateCalendarToken(db: Db, householdId: number): string {
  const token = generateCalendarToken();
  db.update(schema.households).set({ calendarToken: token })
    .where(eq(schema.households.id, householdId)).run();
  return token;
}
