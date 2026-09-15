import { describe, expect, it } from "vitest";

// WCAG 2.x relative-luminance contrast ratio (no dependency: ~15 lines).
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Dark-mode palette from globals.css `@media (prefers-color-scheme: dark)` (mealpal-iky).
const dark = {
  bg: "#15181B",
  surface: "#1E2226",
  surfaceSoft2: "#262B30",
  surface3: "#2E343A",
  ink: "#EDEFF1",
  ink2: "#B9C2CA",
  ink3: "#93A0A8",
  line: "#666C72",
  accent: "#1E7A8C",
  accentPress: "#329BAF",
  accentInk: "#6FD6E8",
  accentWeak: "#12262B",
  accent2Dot: "#E8674F",
  dangerSolid: "#B23A33",
  dangerText: "#FF6259",
  dangerWeak: "#3A1414",
  dangerLine: "#AE4F47",
  warnText: "#F0C36B",
  warnWeak: "#332A10",
  warnLine: "#987A35",
  okText: "#7FD9A0",
  okWeak: "#0F2A1B",
  okLine: "#4E8560",
  macroCarbs: "#F0B84D",
  macroFat: "#F08A6C",
  white: "#FFFFFF",
};

const NORMAL_TEXT = 4.5;
const LARGE_TEXT_OR_UI = 3;

describe("dark mode contrast (WCAG relative luminance)", () => {
  it.each([
    ["ink on bg", dark.ink, dark.bg],
    ["ink on surface", dark.ink, dark.surface],
    ["ink-2 (secondary text) on bg", dark.ink2, dark.bg],
    ["ink-3 (labels/meta) on bg", dark.ink3, dark.bg],
    ["ink-3 on surface", dark.ink3, dark.surface],
    ["accent-ink on bg", dark.accentInk, dark.bg],
    ["accent-ink on accent-weak", dark.accentInk, dark.accentWeak],
    ["white on accent (.btn default)", dark.white, dark.accent],
    ["white on danger-solid (.btn.danger)", dark.white, dark.dangerSolid],
    ["danger text on bg", dark.dangerText, dark.bg],
    ["danger text on surface", dark.dangerText, dark.surface],
    ["warn text on warn-weak", dark.warnText, dark.warnWeak],
    ["ok text on ok-weak", dark.okText, dark.okWeak],
    ["macro-carbs on surface (chart)", dark.macroCarbs, dark.surface],
    ["macro-fat on surface (chart)", dark.macroFat, dark.surface],
  ])("%s clears 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(NORMAL_TEXT);
  });

  it.each([
    ["line (card/input border) on surface", dark.line, dark.surface],
    ["danger-line (chip border) on danger-weak", dark.dangerLine, dark.dangerWeak],
    ["warn-line (chip border) on warn-weak", dark.warnLine, dark.warnWeak],
    ["ok-line (chip border) on ok-weak", dark.okLine, dark.okWeak],
    ["accent-2 status dot on surface", dark.accent2Dot, dark.surface],
    ["macro-fat on surface-3 (gauge track)", dark.macroFat, dark.surface3],
  ])("%s clears 3:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(LARGE_TEXT_OR_UI);
  });

  // Documented, intentional exception: accent-press is a hover-only transient
  // state (mealpal-iky) — its white-on-fill ratio doesn't reach 4.5:1. Assert
  // the known value so a future palette edit doesn't silently regress it further.
  it("accent-press hover fill stays above a basic legibility floor", () => {
    expect(contrastRatio(dark.white, dark.accentPress)).toBeGreaterThan(3);
  });
});
