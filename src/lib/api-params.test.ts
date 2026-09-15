import { describe, expect, test } from "vitest";
import { parseHorizon, parseLimit, parseOffset } from "./api-params";

describe("parseHorizon", () => {
  test("missing/NaN/0 fall back to 14", () => {
    expect(parseHorizon(null)).toBe(14);
    expect(parseHorizon("")).toBe(14);
    expect(parseHorizon("abc")).toBe(14);
    expect(parseHorizon("0")).toBe(14);
  });

  test("negative is rejected", () => {
    expect(parseHorizon("-5")).toBe("invalid");
  });

  test("out-of-range (>90) is rejected", () => {
    expect(parseHorizon("91")).toBe("invalid");
  });

  test("in-range value passes through", () => {
    expect(parseHorizon("30")).toBe(30);
  });
});

describe("parseOffset", () => {
  test("missing/NaN/0 mean no offset", () => {
    expect(parseOffset(null)).toBeUndefined();
    expect(parseOffset("")).toBeUndefined();
    expect(parseOffset("abc")).toBeUndefined();
    expect(parseOffset("0")).toBeUndefined();
  });

  test("negative is rejected", () => {
    expect(parseOffset("-1")).toBe("invalid");
  });

  test("positive passes through", () => {
    expect(parseOffset("5")).toBe(5);
  });
});

describe("parseLimit", () => {
  test("missing/NaN/non-positive mean no limit", () => {
    expect(parseLimit(null)).toBeUndefined();
    expect(parseLimit("abc")).toBeUndefined();
    expect(parseLimit("0")).toBeUndefined();
    expect(parseLimit("-5")).toBeUndefined();
  });

  test("huge limit is capped, not rejected", () => {
    expect(parseLimit("99999")).toBe(100);
  });

  test("small positive limit passes through", () => {
    expect(parseLimit("10")).toBe(10);
  });
});
