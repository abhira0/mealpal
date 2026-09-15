import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStepDuration, resolveSwipe } from "@/lib/cook-mode-helpers";

describe("resolveSwipe", () => {
  it("swipes left past threshold -> next (1)", () => {
    expect(resolveSwipe(-80, 0)).toBe(1);
  });

  it("swipes right past threshold -> prev (-1)", () => {
    expect(resolveSwipe(80, 0)).toBe(-1);
  });

  it("ignores small deltas (tap)", () => {
    expect(resolveSwipe(10, 2)).toBe(0);
    expect(resolveSwipe(-49, 0)).toBe(0);
  });

  it("ignores mostly-vertical movement (scroll)", () => {
    expect(resolveSwipe(60, 90)).toBe(0);
  });

  it("respects a custom threshold", () => {
    expect(resolveSwipe(-30, 0, 20)).toBe(1);
    expect(resolveSwipe(-15, 0, 20)).toBe(0);
  });
});

describe("parseStepDuration", () => {
  it("parses minutes", () => {
    expect(parseStepDuration("Simmer for 10 minutes")).toBe(600);
    expect(parseStepDuration("Rest 2 min")).toBe(120);
  });

  it("parses seconds", () => {
    expect(parseStepDuration("Sear for 30 seconds")).toBe(30);
    expect(parseStepDuration("Toast 45 sec")).toBe(45);
  });

  it("is case-insensitive and tolerates no space before the unit", () => {
    expect(parseStepDuration("wait 5MIN")).toBe(300);
  });

  it("returns null when no duration is present", () => {
    expect(parseStepDuration("Whisk the eggs until fluffy")).toBeNull();
  });
});

describe("cook mode tap-target CSS", () => {
  const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

  it("gives cook-nav buttons and the timer affordance a 44px minimum (knuckle-friendly)", () => {
    expect(css).toMatch(/\.cook-nav \.btn\{[^}]*min-width:44px[^}]*min-height:44px/);
    expect(css).toMatch(/\.cook-timer\{[^}]*min-width:44px[^}]*min-height:44px/);
  });
});
