import { describe, it, expect } from "vitest";
import { packsNeeded, convertCanonical, formatQty } from "@/lib/units";

describe("packsNeeded", () => {
  it("rounds up to the next whole pack", () => {
    expect(packsNeeded(650, 500)).toBe(2);
  });

  it("returns exactly 1 when the need fits in a single pack", () => {
    expect(packsNeeded(400, 500)).toBe(1);
  });

  it("returns exactly 1 when the need matches the pack size exactly", () => {
    expect(packsNeeded(500, 500)).toBe(1);
  });

  it("never returns fewer than 1 pack, even for a tiny need", () => {
    expect(packsNeeded(0.001, 500)).toBe(1);
  });

  it("falls back to 1 pack when the pack size is missing or non-positive", () => {
    expect(packsNeeded(650, 0)).toBe(1);
    expect(packsNeeded(650, -5)).toBe(1);
  });
});

describe("convertCanonical", () => {
  it("returns the same amount for identical units", () => {
    expect(convertCanonical(10, "g", "g")).toBe(10);
  });

  it("converts oz to g and back", () => {
    expect(convertCanonical(1, "oz", "g")).toBeCloseTo(28.3495, 4);
    expect(convertCanonical(28.3495, "g", "oz")).toBeCloseTo(1, 4);
  });

  it("returns null across dimensions it can't convert (e.g. ml to g)", () => {
    expect(convertCanonical(10, "ml", "g")).toBeNull();
  });
});

describe("formatQty", () => {
  it("rolls grams up to kg at 1000", () => {
    expect(formatQty(1500, "g")).toBe("1.5 kg");
  });

  it("keeps sub-1000 grams as-is", () => {
    expect(formatQty(500, "g")).toBe("500 g");
  });

  it("keeps count unitless", () => {
    expect(formatQty(3, "count")).toBe("3");
  });
});
