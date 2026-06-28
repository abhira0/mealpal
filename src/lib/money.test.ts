import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars } from "@/lib/money";

describe("money", () => {
  it("converts dollars to integer cents without float drift", () => {
    expect(dollarsToCents(12.99)).toBe(1299);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(Number.isInteger(dollarsToCents(19.99))).toBe(true);
  });
  it("converts cents back to a dollar number", () => {
    expect(centsToDollars(1299)).toBe(12.99);
  });
});
