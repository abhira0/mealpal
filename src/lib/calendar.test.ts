import { describe, expect, it } from "vitest";
import type { AgendaDay } from "@/lib/agenda";
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

  it("emits one all-day VEVENT per meal and cook flag, with escaped text", () => {
    const days: AgendaDay[] = [
      {
        date: "2026-08-09",
        meals: [
          { slotName: "Lunch", name: "Chicken, rice", eventId: 12, batchId: null, slotId: 2 } as AgendaDay["meals"][number],
        ],
        cookFlags: [{ slotId: 2, slotName: "Lunch", label: "Chicken & rice" }],
        eatenCount: 0,
        totalCount: 1,
      },
    ];
    const ics = buildIcs(days, new Date("2026-08-09T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("\r\n"); // CRLF line endings
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2); // meal + cook flag
    expect(ics).toContain("DTSTART;VALUE=DATE:20260809");
    expect(ics).toContain("DTEND;VALUE=DATE:20260810");
    expect(ics).toContain("SUMMARY:Lunch: Chicken\\, rice"); // comma escaped
    expect(ics).toContain("UID:ev-12@mealpal");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
