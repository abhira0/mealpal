/** "1:05" or "65" -> 65 seconds; blank/invalid -> null. */
export function parseClip(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [m, sec] = t.split(":");
    const total = Number(m) * 60 + Number(sec);
    return Number.isFinite(total) ? total : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 65 -> "1:05"; null -> "". */
export function fmtClip(n: number | null | undefined): string {
  if (n == null) return "";
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
