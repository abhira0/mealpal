import { describe, expect, it } from "vitest";
import { fmtClip, parseClip } from "@/lib/clip";

describe("parseClip", () => {
  it("parses bare seconds", () => {
    expect(parseClip("65")).toBe(65);
    expect(parseClip("0")).toBe(0);
  });

  it("parses mm:ss into total seconds", () => {
    expect(parseClip("1:05")).toBe(65);
    expect(parseClip("2:30")).toBe(150);
  });

  it("treats blank input as null", () => {
    expect(parseClip("")).toBeNull();
    expect(parseClip("   ")).toBeNull();
  });

  it("treats non-numeric input as null", () => {
    expect(parseClip("abc")).toBeNull();
    expect(parseClip("1:xx")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseClip("  1:05  ")).toBe(65);
  });
});

describe("fmtClip", () => {
  it("formats seconds as m:ss", () => {
    expect(fmtClip(65)).toBe("1:05");
    expect(fmtClip(150)).toBe("2:30");
    expect(fmtClip(0)).toBe("0:00");
  });

  it("returns empty string for null/undefined", () => {
    expect(fmtClip(null)).toBe("");
    expect(fmtClip(undefined)).toBe("");
  });

  it("round-trips through parseClip", () => {
    expect(parseClip(fmtClip(65))).toBe(65);
    expect(parseClip(fmtClip(3661))).toBe(3661);
  });
});
