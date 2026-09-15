import { describe, expect, it } from "vitest";
import type { NextCook } from "@/lib/agenda";
import { buildIcs, calendarToken, calendarTokenValid } from "@/lib/calendar";

process.env.AUTH_SECRET ??= "test-secret";

describe("calendar feed", () => {
  it("token validates itself and rejects tampering", () => {
    const t = calendarToken(7);
    expect(calendarTokenValid(7, t)).toBe(true);
    expect(calendarTokenValid(7, t.slice(0, -1) + "0")).toBe(false); // wrong token
    expect(calendarTokenValid(8, t)).toBe(false); // right token, wrong household
    expect(calendarTokenValid(7, "short")).toBe(false); // length mismatch, no throw
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

  it("folds long lines at 75 octets (RFC 5545 §3.1), UTF-8 safe, and round-trips", () => {
    const longLabel = "🍳".repeat(10) + "Extremely Descriptive Recipe Name ".repeat(6);
    expect(longLabel.length).toBeGreaterThanOrEqual(200);
    const cooks: NextCook[] = [
      { slotId: 9, slotName: "Dinner", label: longLabel, cookDate: "2026-08-09", daysAway: 0 },
    ];
    const ics = buildIcs(cooks, new Date("2026-08-09T00:00:00Z"));

    const rawLines = ics.split("\r\n");
    rawLines.pop(); // trailing "" from final \r\n
    for (const line of rawLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }

    // Unfold per RFC 5545 §3.1: a CRLF followed by a single leading space is
    // removed and the following line's content is appended to the previous one.
    const unfolded: string[] = [];
    for (const line of rawLines) {
      if (line.startsWith(" ") && unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.slice(1);
      } else {
        unfolded.push(line);
      }
    }
    // If a multi-byte emoji codepoint had been split across a fold boundary,
    // Buffer's lossy UTF-8 decoding would have inserted U+FFFD replacement
    // characters when each chunk was decoded — so an exact match here proves
    // every fold landed on a codepoint boundary.
    const summaryLine = unfolded.find((l) => l.startsWith("SUMMARY:"));
    expect(summaryLine).toBe(`SUMMARY:🍳 ${longLabel} (Dinner prep)`);
    expect(summaryLine).not.toContain("�");
  });
});
