import { describe, it, expect } from "vitest";
import { predictRunout } from "@/lib/predict";

describe("predictRunout (pure)", () => {
  it("with no history, returns a point estimate (low==high==point) minus safety buffer", () => {
    // 1000g stock, planned 200g/day, no history variance, buffer 0 days
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 0, historyDays: 0, bufferDays: 0 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(5);
    expect(r.highDays).toBe(5);
  });

  it("applies the safety buffer to the actionable (low) estimate", () => {
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 0, historyDays: 0, bufferDays: 1 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(4); // buy a day earlier
  });

  it("with enough history, widens the range using stddev", () => {
    // rate 200 ± 50, enough history -> low uses rate+stddev (250), high uses rate-stddev (150)
    const r = predictRunout({ stock: 1000, dailyRate: 200, dailyStdDev: 50, historyDays: 14, bufferDays: 0 });
    expect(r.pointDays).toBe(5);
    expect(r.lowDays).toBe(4);  // 1000/250
    expect(r.highDays).toBe(7); // floor(1000/150)
  });

  it("treats a zero consumption rate as never running out", () => {
    const r = predictRunout({ stock: 500, dailyRate: 0, dailyStdDev: 0, historyDays: 0, bufferDays: 0 });
    expect(r.pointDays).toBe(Infinity);
  });

  it("keeps low <= point <= high for a sub-1-unit/day rate (e.g. a 'count' item eaten every other day)", () => {
    // Regression: a hardcoded floor of 1 unit/day on the low-rate clamp used to
    // invert the range whenever dailyRate < 1 (highDays came out below pointDays).
    const r = predictRunout({ stock: 10, dailyRate: 0.5, dailyStdDev: 0, historyDays: 0, bufferDays: 0 });
    expect(r.pointDays).toBe(20);
    expect(r.lowDays).toBeLessThanOrEqual(r.pointDays);
    expect(r.highDays).toBeGreaterThanOrEqual(r.pointDays);
  });
});
