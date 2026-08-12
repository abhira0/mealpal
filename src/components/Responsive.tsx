"use client";

import type { ReactNode } from "react";
import { useIsDesktop } from "@/lib/useIsDesktop";

/**
 * Renders completely separate mobile/desktop subtrees. Only the active one
 * mounts, so there is no double data-fetching. Shows a neutral busy skeleton
 * until the viewport is known (matches SSR output → no hydration mismatch).
 */
export function Responsive({
  mobile,
  desktop,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop === null) return <div className="content" aria-busy="true" />;
  return <>{isDesktop ? desktop : mobile}</>;
}
