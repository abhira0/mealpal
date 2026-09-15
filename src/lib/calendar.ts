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

export const DEFAULT_TIMEZONE = "America/Phoenix";

// UTC offset ("+HHMM"/"-HHMM") and zone abbreviation for `tz` on `date`,
// read off Intl's own tzdata so we don't hand-maintain a zone table.
function tzOffsetParts(tz: string, date: Date): { offset: string; abbr: string } {
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = offsetName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  const offset = m ? `${m[1]}${m[2].padStart(2, "0")}${m[3] ?? "00"}` : "+0000";
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? tz;
  return { offset, abbr };
}

// VTIMEZONE for `tz`: a single fixed-offset STANDARD block for a zone that
// never observes DST (byte-identical to the original hand-written
// America/Phoenix block), else a STANDARD+DAYLIGHT pair.
// ponytail: assumes the US 2007+ DST rule (2nd Sun Mar → 1st Sun Nov); correct
// for every America/* zone that observes DST, wrong if a household ever picks
// a non-US DST rule or the southern hemisphere.
function buildVtimezone(tz: string): string[] {
  const winter = tzOffsetParts(tz, new Date(Date.UTC(2026, 0, 15))); // Jan 15: always standard time
  const summer = tzOffsetParts(tz, new Date(Date.UTC(2026, 6, 15))); // Jul 15: always daylight time, if observed

  if (winter.offset === summer.offset) {
    return [
      "BEGIN:VTIMEZONE",
      `TZID:${tz}`,
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${winter.offset}`,
      `TZOFFSETTO:${winter.offset}`,
      `TZNAME:${winter.abbr}`,
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }

  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    `TZOFFSETFROM:${summer.offset}`,
    `TZOFFSETTO:${winter.offset}`,
    `TZNAME:${winter.abbr}`,
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    `TZOFFSETFROM:${winter.offset}`,
    `TZOFFSETTO:${summer.offset}`,
    `TZNAME:${summer.abbr}`,
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h + (m || 0) / 60;
}

// Wall-clock [start, end] hours a prep should occupy, in the household's
// timezone. A slot's own prepStart/prepEnd (set in /manage/slots) wins;
// otherwise this falls back to the original hardcoded heuristic so existing
// households with unconfigured slots keep their exact prior feed output.
function prepHours(c: NextCook): [number, number] | null {
  if (c.prepStart && c.prepEnd) return [parseHM(c.prepStart), parseHM(c.prepEnd)];
  if (c.label.toLowerCase().includes("overnight oats")) return [20, 20.5]; // 8–8:30pm
  if (c.slotName === "Lunch" || c.slotName === "Dinner") return [18, 20]; // 6–8pm
  return null; // fall back to all-day
}

const clock = (h: number) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
};

/**
 * The upcoming cook-prep dates (the homepage's "🍳 Next cooking" cards) as an
 * iCalendar feed. Prep with a known time (see prepHours) gets a 30-min timed
 * event, wall-clock in `timezone` (the household's, defaulting to the
 * original America/Phoenix); anything else stays all-day (VALUE=DATE
 * sidesteps timezone math).
 */
export function buildIcs(cooks: NextCook[], timezone: string = DEFAULT_TIMEZONE, stamp = new Date()): string {
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
    ...buildVtimezone(timezone),
  ];
  for (const c of cooks) {
    const hours = prepHours(c);
    const [start, end] =
      hours == null
        ? [`DTSTART;VALUE=DATE:${ymd(c.cookDate)}`, `DTEND;VALUE=DATE:${nextDay(c.cookDate)}`]
        : [`DTSTART;TZID=${timezone}:${ymd(c.cookDate)}T${clock(hours[0])}`, `DTEND;TZID=${timezone}:${ymd(c.cookDate)}T${clock(hours[1])}`];
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
