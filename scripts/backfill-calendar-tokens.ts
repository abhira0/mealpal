// One-off backfill for drizzle/0038_household_calendar_token.sql.
// Before this migration, every household's ICS feed token was derived on the
// fly as HMAC(AUTH_SECRET, "calendar:" + householdId) — see the old
// src/lib/calendar.ts. Feed URLs are permanent (pasted into Google/Apple
// Calendar), so on migration day every household must be backfilled with
// EXACTLY that same derived value, or every already-subscribed calendar
// silently 404s.
// Run once, after applying 0038 to the target DB: npx tsx scripts/backfill-calendar-tokens.ts
import { createHmac } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "../src/db";

function legacyDerivedToken(householdId: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to derive legacy calendar tokens");
  return createHmac("sha256", secret).update(`calendar:${householdId}`).digest("hex").slice(0, 24);
}

function run() {
  const rows = db.select({ id: schema.households.id })
    .from(schema.households)
    .where(isNull(schema.households.calendarToken))
    .all();
  for (const { id } of rows) {
    db.update(schema.households)
      .set({ calendarToken: legacyDerivedToken(id) })
      .where(eq(schema.households.id, id))
      .run();
  }
  console.log(`Backfilled calendarToken for ${rows.length} household(s).`);
}

run();
