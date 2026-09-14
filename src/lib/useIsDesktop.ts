"use client";

import { useEffect, useState } from "react";

// Single source of truth for the desktop breakpoint. Kept in sync with the
// nav/layout media query in globals.css (min-width:1024px).
const QUERY = "(min-width: 1024px)";

/**
 * Viewport-based device switch. Returns `null` until mounted so the server and
 * the first client render agree (no hydration mismatch), then `true`/`false`
 * and stays live across resizes. Next 16 has no built-in viewport switch —
 * matchMedia is the mechanism.
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
