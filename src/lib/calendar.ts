import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextCook } from "@/lib/agenda";

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
 * The upcoming cook-prep dates (the homepage's "🍳 Next cooking" cards) as an
 * iCalendar feed of all-day events. All-day (VALUE=DATE) sidesteps slot-time
 * timezone math — a prep date is day-granular anyway.
 * ponytail: all-day events; emit DTSTART with the slot's timeOfDay if you want
 * prep to land at a real time.
 */
export function buildIcs(cooks: NextCook[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mealpal//meal plan//EN",
    "CALSCALE:GREGORIAN",
    "NAME:MealPal",
    "X-WR-CALNAME:MealPal",
  ];
  for (const c of cooks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:cook-${c.slotId}-${c.cookDate}@mealpal`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${ymd(c.cookDate)}`,
      `DTEND;VALUE=DATE:${nextDay(c.cookDate)}`,
      `SUMMARY:${esc(`🍳 ${c.label} (${c.slotName} prep)`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n"; // RFC 5545 requires CRLF
}
