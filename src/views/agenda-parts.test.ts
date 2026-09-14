import { describe, expect, it } from "vitest";
import { dayHeaderLabel } from "@/views/agenda-parts";

describe("dayHeaderLabel", () => {
  const today = "2026-08-13";

  it("labels today", () => {
    expect(dayHeaderLabel(today, today)).toBe("Today");
  });

  it("labels yesterday", () => {
    expect(dayHeaderLabel("2026-08-12", today)).toBe("Yesterday");
  });

  it("labels tomorrow", () => {
    expect(dayHeaderLabel("2026-08-14", today)).toBe("Tomorrow");
  });

  it("falls back to a weekday/month/day label for other dates", () => {
    const label = dayHeaderLabel("2026-08-20", today);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
    expect(label).not.toBe("Tomorrow");
    expect(label).toMatch(/Thu|Aug 20/);
  });
});
