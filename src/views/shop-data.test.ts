import { describe, expect, it } from "vitest";
import { sumLines, type RawLine } from "@/views/shop-data";

function line(overrides: Partial<RawLine> = {}): RawLine {
  return {
    ingredientId: 1,
    ingredientName: "Flour",
    needed: 500,
    product: { id: 10, name: "Flour 500g" },
    ...overrides,
  };
}

describe("sumLines", () => {
  it("prices a single-pack line once", () => {
    const total = sumLines([line({ needed: 500, product: { id: 10, name: "Flour 500g", packSize: 500 } })], {
      10: 300,
    });
    expect(total).toBe(300);
  });

  it("multiplies price by packs needed for a multi-pack line", () => {
    // Needs 1200g of a 500g pack -> 3 packs.
    const total = sumLines(
      [line({ needed: 1200, product: { id: 10, name: "Flour 500g", packSize: 500 } })],
      { 10: 300 },
    );
    expect(total).toBe(900);
  });

  it("treats a missing packSize as a single pack", () => {
    const total = sumLines([line({ needed: 1200, product: { id: 10, name: "Flour" } })], { 10: 300 });
    expect(total).toBe(300);
  });

  it("skips lines with no product", () => {
    const total = sumLines([line({ product: null })], { 10: 300 });
    expect(total).toBe(0);
  });

  it("treats a missing price as free (0 cents)", () => {
    const total = sumLines([line({ needed: 1000, product: { id: 10, name: "Flour", packSize: 500 } })], {});
    expect(total).toBe(0);
  });

  it("sums multiple lines, each scaled by its own pack count", () => {
    const total = sumLines(
      [
        line({ ingredientId: 1, needed: 1000, product: { id: 10, name: "Flour", packSize: 500 } }), // 2 packs
        line({ ingredientId: 2, needed: 250, product: { id: 20, name: "Sugar", packSize: 500 } }), // 1 pack
      ],
      { 10: 300, 20: 200 },
    );
    expect(total).toBe(300 * 2 + 200 * 1);
  });
});
