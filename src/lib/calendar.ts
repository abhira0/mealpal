import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextCook } from "@/lib/agenda";

// Per-household calendar token, stored on households.calendarToken (see
// drizzle/0038_household_calendar_token.sql). Previously this was derived
// on the fly from AUTH_SECRET, but that made a single household's feed
// un-revocable without rotating AUTH_SECRET and invalidating every session
// in the app. A stored, regeneratable token fixes that: a "Regenerate
// calendar link" action just overwrites the column, and the old URL 404s.
export function generateCalendarToken(): string {
  return randomBytes(18).toString("hex"); // 36 hex chars, unguessable
}

// Constant-time compare against the household's stored token. Mirrors the
// timingSafeEqual + length-check pattern used elsewhere in this repo so a
// length mismatch (e.g. no token yet) can't throw or short-circuit on a
// cheap string compare first.
export function calendarTokenMatches(stored: string | null | undefined, given: string): boolean {
  if (!stored || !given) return false;
  const want = Buffer.from(stored);
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ICS TEXT escaping: backslash, semicolon, comma, newline (RFC 5545 §3.3.11).
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const ymd = (isoDate: string) => isoDate.replace(/-/g, ""); // "2026-08-09" -> "20260809"
const nextDay = (isoDate: string) => ymd(new Date(Date.parse(isoDate) + 86_400_000).toISOString().slice(0, 10));

// Prep times are Arizona wall-clock. Phoenix never observes DST, so the offset
// is a constant -0700 — a one-rule VTIMEZONE, and every client pins the event
// to 6/8pm AZ regardless of the viewer's own timezone.
// ponytail: hardcoded to America/Phoenix; store a per-household tz if you ever
// go multi-timezone.
const TZID = "America/Phoenix";
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0700",
  "TZNAME:MST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// Wall-clock [start, end] hours a prep should occupy, in AZ time.
// ponytail: hardcoded times; hoist to slot config if you want them editable.
function prepHours(c: NextCook): [number, number] | null {
  if (c.label.toLowerCase().includes("overnight oats")) return [20, 20.5]; // 8–8:30pm
  if (c.slotName === "Lunch" || c.slotName === "Dinner") return [18, 20]; // 6–8pm
  return null; // fall back to all-day
}

const clock = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}${String((h % 1) * 60).padStart(2, "0")}00`;

/**
 * The upcoming cook-prep dates (the homepage's "🍳 Next cooking" cards) as an
 * iCalendar feed. Prep with a known time (see prepHour) gets a 30-min timed
 * event; anything else stays all-day (VALUE=DATE sidesteps timezone math).
 */
export function buildIcs(cooks: NextCook[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//platr//meal plan//EN",
    "CALSCALE:GREGORIAN",
    "NAME:Platr",
    "X-WR-CALNAME:Platr",
    // Tells subscribing clients (Apple/Google/Outlook) how often to re-poll,
    // matching the route's hour-long Cache-Control so a plan change shows up
    // without the user having to manually refresh the subscription.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const c of cooks) {
    const hours = prepHours(c);
    const [start, end] =
      hours == null
        ? [`DTSTART;VALUE=DATE:${ymd(c.cookDate)}`, `DTEND;VALUE=DATE:${nextDay(c.cookDate)}`]
        : [`DTSTART;TZID=${TZID}:${ymd(c.cookDate)}T${clock(hours[0])}`, `DTEND;TZID=${TZID}:${ymd(c.cookDate)}T${clock(hours[1])}`];
    lines.push(
      "BEGIN:VEVENT",
      `UID:cook-${c.slotId}-${c.cookDate}@platr`,
      `DTSTAMP:${dtstamp}`,
      start,
      end,
      `SUMMARY:${esc(`🍳 ${c.label} (${c.slotName} prep)`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n"; // RFC 5545 requires CRLF
}
