import { describe, expect, it } from "vitest";
import type { NextCook } from "@/lib/agenda";
import { buildIcs, calendarTokenMatches, generateCalendarToken } from "@/lib/calendar";

describe("calendar feed token", () => {
  it("matches the stored token and rejects tampering / mismatch / missing", () => {
    const t = generateCalendarToken();
    expect(calendarTokenMatches(t, t)).toBe(true);
    expect(calendarTokenMatches(t, t.slice(0, -1) + (t.at(-1) === "0" ? "1" : "0"))).toBe(false); // tampered
    expect(calendarTokenMatches(t, "short")).toBe(false); // length mismatch, no throw
    expect(calendarTokenMatches(null, t)).toBe(false); // no stored token yet
    expect(calendarTokenMatches(t, "")).toBe(false);
  });

  it("generates unique, unguessable-length tokens", () => {
    const a = generateCalendarToken();
    const b = generateCalendarToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("emits a timed VEVENT per cook-prep date, with escaped text", () => {
    const cooks: NextCook[] = [
      { slotId: 2, slotName: "Lunch", label: "Chicken, rice", cookDate: "2026-08-09", daysAway: 0 },
      { slotId: 1, slotName: "Breakfast", label: "Overnight Oats", cookDate: "2026-08-10", daysAway: 1 },
    ];
    const ics = buildIcs(cooks, new Date("2026-08-09T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("\r\n"); // CRLF line endings
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain("TZID:America/Phoenix"); // VTIMEZONE present
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H"); // re-poll hint for subscribing clients
    expect(ics).toContain("DTSTART;TZID=America/Phoenix:20260809T180000"); // Lunch 6–8pm AZ
    expect(ics).toContain("DTEND;TZID=America/Phoenix:20260809T200000");
    expect(ics).toContain("DTSTART;TZID=America/Phoenix:20260810T200000"); // Overnight Oats 8pm AZ
    expect(ics).toContain("SUMMARY:🍳 Chicken\\, rice (Lunch prep)"); // comma escaped
    expect(ics).toContain("UID:cook-2-2026-08-09@platr");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
