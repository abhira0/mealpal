/** Date-only YYYY-MM-DD strings, shared by every route that accepts one. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A Date as YYYY-MM-DD in local time (toISOString would give the UTC date). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today as YYYY-MM-DD, local time. */
export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * A date-only value anchored at local noon so it doesn't roll to the previous
 * day in negative-offset timezones.
 */
export function localNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
