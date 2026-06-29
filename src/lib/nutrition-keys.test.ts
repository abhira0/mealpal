import { describe, it, expect } from "vitest";
import { NUTRIENT_KEYS } from "@/lib/nutrition";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";
import { FACT_ROWS } from "@/components/NutritionFacts";
import { EDITOR_KEYS } from "@/components/NutritionFactsEditor";

// The nutrient field list is duplicated across the compute layer, the PATCH
// whitelist, and the read-only label. They MUST cover the same set — drift here
// is exactly what made the product label stop at "Protein" (micros dropped).
const sorted = (xs: readonly string[]) => [...xs].sort();

describe("nutrient key lists stay in sync", () => {
  const compute = sorted(NUTRIENT_KEYS);
  const patch = sorted(NUTRIENT_PATCH_KEYS);
  // FACT_ROWS omits "calories" (it's the big number, not a % DV row).
  const label = sorted(["calories", ...FACT_ROWS.map((r) => r.key)]);

  it("compute keys match the PATCH whitelist", () => {
    expect(patch).toEqual(compute);
  });

  it("compute keys match the read-only label rows", () => {
    expect(label).toEqual(compute);
  });

  it("compute keys match the editable label (prefill + save)", () => {
    expect(sorted(EDITOR_KEYS)).toEqual(compute);
  });
});
