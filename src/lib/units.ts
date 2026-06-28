import { centsToDollars } from "@/lib/money";

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
