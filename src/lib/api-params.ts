// Small query-param validators shared by API routes. Kept dependency-free
// (no next/server, no auth) so they're cheap to unit test in isolation.

// shoppingList clamps horizon to [1, 90] internally; reject out-of-range values
// instead of silently reinterpreting them (a negative horizon used to sail
// through and mean something the caller never asked for).
export function parseHorizon(raw: string | null): number | "invalid" {
  if (!raw) return 14;
  const n = Number(raw);
  if (Number.isNaN(n) || n === 0) return 14;
  if (n < 1 || n > 90) return "invalid";
  return n;
}

const MAX_HISTORY_LIMIT = 100;

// Cap silently rather than rejecting — an oversized limit is just "give me
// everything", which we can satisfy at a sane page size instead of a 400.
export function parseLimit(raw: string | null): number | undefined {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(MAX_HISTORY_LIMIT, n);
}

// A negative offset reaches SQLite and throws there instead of here, so
// reject it up front. NaN/0/missing keep the old "no offset" behavior.
export function parseOffset(raw: string | null): number | undefined | "invalid" {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  if (n < 0) return "invalid";
  return n || undefined;
}
