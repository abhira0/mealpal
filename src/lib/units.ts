import { centsToDollars } from "@/lib/money";

/**
 * The only canonical units the app understands. Anything else breaks
 * formatQty's kg/l rollup and convertCanonical's conversion table, so both
 * POST and PATCH on /api/ingredients must reject values outside this set.
 */
export const CANONICAL_UNITS = ["g", "ml", "oz", "count"] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

export function isCanonicalUnit(value: unknown): value is CanonicalUnit {
  return CANONICAL_UNITS.includes(value as CanonicalUnit);
}

/**
 * Display formatter for a canonical amount. Rolls grams/millilitres up to
 * kg/l at 1000, trims trailing zeros, and keeps "count" unitless.
 */
export function formatQty(amount: number, unit: string): string {
  if (unit === "g" || unit === "ml") {
    if (Math.abs(amount) >= 1000) {
      const big = amount / 1000;
      return `${trim(big)} ${unit === "g" ? "kg" : "l"}`;
    }
    return `${trim(amount)} ${unit}`;
  }
  if (unit === "count") {
    return trim(amount);
  }
  return `${trim(amount)} ${unit}`;
}

export function formatServings(n: number): string {
  return `${trim(n)} ${Math.abs(n) === 1 ? "serving" : "servings"}`;
}

export function formatPrice(cents: number): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Whole packs needed to cover a required amount, rounded up (e.g. need 650g of
 * a 500g pack → 2 packs). A missing/non-positive pack size can't be divided
 * into, so it counts as a single pack rather than exploding into Infinity/NaN.
 */
export function packsNeeded(needed: number, packSize: number): number {
  if (!(packSize > 0)) return 1;
  return Math.max(1, Math.ceil(needed / packSize));
}

const G_PER_OZ = 28.3495;

/**
 * Convert a canonical amount between the app's units. Only oz↔g (mass) is
 * possible — ml↔g would need a density we don't store, so cross-dimension
 * pairs return null and the caller keeps the scraped number as-is.
 */
export function convertCanonical(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  if (from === "oz" && to === "g") return amount * G_PER_OZ;
  if (from === "g" && to === "oz") return amount / G_PER_OZ;
  return null;
}
