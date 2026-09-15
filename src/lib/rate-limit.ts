// ponytail: naive per-process, per-IP rate limiter. State lives in a plain
// Map in this process's memory: it resets on restart and isn't shared across
// instances, so it's trivial to route around in a multi-instance deploy
// (each instance/restart gets its own fresh budget). Fine for this
// single-container app; if this ever needs to hold up under horizontal
// scaling, swap the Map for a shared store (e.g. Redis INCR + EXPIRE) keyed
// the same way.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** True if `key` has already hit the attempt ceiling for the current window. */
export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

/** Record an attempt for `key`, starting a new window if the old one expired. */
export function recordAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}
