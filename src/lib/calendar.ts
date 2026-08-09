import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgendaDay } from "@/lib/agenda";

// Per-household calendar token, derived from AUTH_SECRET — no DB column needed.
// Unguessable and stable; rotating AUTH_SECRET revokes every feed at once.
// ponytail: one shared secret → per-household tokens; store a real token column
// if you ever need to revoke a single household's feed without rotating all.
export function calendarToken(householdId: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for calendar feeds");
  return createHmac("sha256", secret).update(`calendar:${householdId}`).digest("hex").slice(0, 24);
}

export function calendarTokenValid(householdId: number, token: string): boolean {
  const want = Buffer.from(calendarToken(householdId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ICS TEXT escaping: backslash, semicolon, comma, newline (RFC 5545 §3.3.11).
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const ymd = (isoDate: string) => isoDate.replace(/-/g, ""); // "2026-08-09" -> "20260809"
const nextDay = (isoDate: string) => ymd(new Date(Date.parse(isoDate) + 86_400_000).toISOString().slice(0, 10));

/**
 * All planned/eaten meals and batch-cook days in [from, to] as an iCalendar
 * feed of all-day events. All-day (VALUE=DATE) sidesteps slot-time timezone
 * math — the plan is day-granular anyway.
 * ponytail: all-day events; emit DTSTART with the slot's timeOfDay if you want
 * meals to land at real times.
 */
export function buildIcs(days: AgendaDay[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mealpal//meal plan//EN",
    "CALSCALE:GREGORIAN",
    "NAME:MealPal",
    "X-WR-CALNAME:MealPal",
  ];
  const event = (uid: string, date: string, summary: string) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}@mealpal`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${nextDay(date)}`,
      `SUMMARY:${esc(summary)}`,
      "END:VEVENT",
    );
  };
  for (const day of days) {
    for (const flag of day.cookFlags) {
      event(`cook-${day.date}-${flag.slotId}`, day.date, `🍳 Cook: ${flag.label} (${flag.slotName})`);
    }
    for (const m of day.meals) {
      const uid = m.eventId != null ? `ev-${m.eventId}` : `batch-${m.batchId}-${m.slotId}-${day.date}`;
      event(uid, day.date, `${m.slotName}: ${m.name}`);
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n"; // RFC 5545 requires CRLF
}
