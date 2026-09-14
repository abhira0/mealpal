import { describe, expect, it } from "vitest";
import { DATE_RE, localNoon, toISODate, todayISO } from "./dates";

describe("DATE_RE", () => {
  it("matches well-formed YYYY-MM-DD strings", () => {
    expect(DATE_RE.test("2026-08-13")).toBe(true);
    expect(DATE_RE.test("0001-01-01")).toBe(true);
  });

  it("rejects malformed or non-date strings", () => {
    expect(DATE_RE.test("2026-8-13")).toBe(false); // not zero-padded
    expect(DATE_RE.test("26-08-13")).toBe(false);
    expect(DATE_RE.test("2026/08/13")).toBe(false);
    expect(DATE_RE.test("2026-08-13T00:00:00")).toBe(false);
    expect(DATE_RE.test("")).toBe(false);
    expect(DATE_RE.test("not-a-date")).toBe(false);
  });
});

describe("toISODate", () => {
  it("formats using local calendar fields, zero-padded", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05"); // Jan 5
    expect(toISODate(new Date(2026, 11, 31))).toBe("2026-12-31"); // Dec 31
  });

  it("does not shift to the UTC date near local midnight boundaries", () => {
    // Construct a local-time Date just after local midnight; toISOString()
    // (UTC-based) would report a different date in positive-offset zones,
    // but toISODate must reflect the local day.
    const d = new Date(2026, 5, 15, 0, 30); // June 15, 00:30 local
    expect(toISODate(d)).toBe("2026-06-15");
  });
});

describe("todayISO", () => {
  it("matches DATE_RE and equals toISODate(new Date())", () => {
    expect(DATE_RE.test(todayISO())).toBe(true);
    expect(todayISO()).toBe(toISODate(new Date()));
  });
});

describe("localNoon", () => {
  it("parses a date string to a Date anchored at local noon", () => {
    const d = localNoon("2026-08-13");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August, 0-indexed
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(12);
  });

  it("round-trips through toISODate regardless of timezone offset", () => {
    // The whole point of anchoring at noon is that formatting it back
    // never rolls to the previous or next local day.
    for (const date of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      expect(toISODate(localNoon(date))).toBe(date);
    }
  });
});
