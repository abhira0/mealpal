// Pure helpers for CookMode's swipe navigation and step-timer affordance —
// split out from the component so they're unit-testable without a DOM.

/** Swipe left -> next (1), swipe right -> prev (-1), too small/too vertical -> 0 (ignore, let scroll/tap happen). */
export function resolveSwipe(dx: number, dy: number, threshold = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  if (Math.abs(dy) > Math.abs(dx)) return 0;
  return dx < 0 ? 1 : -1;
}

const DURATION_RE = /(\d+)\s*(minute|min|second|sec)s?/i;

/** Pulls a rough duration (in seconds) out of step text, e.g. "simmer for 10 minutes" -> 600. */
export function parseStepDuration(text: string): number | null {
  const m = text.match(DURATION_RE);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2].toLowerCase().startsWith("min") ? n * 60 : n;
}
