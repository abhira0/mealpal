"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Back chrome that returns to the page you actually came from; the href is the
// fallback for deep links / new tabs with no history to go back to.
// ponytail: history.length is a heuristic — a tab that arrived from another
// site backs out of the app; add a sessionStorage nav counter if that bites.
// icon: render just the ← glyph as a square button (used in PageHeader beside
// the breadcrumbs); text label otherwise. Label stays "Back" — the destination
// varies with history, so naming a page would be wrong when you arrived elsewhere.
export function BackLink({ href, icon = false }: { href: string; icon?: boolean }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={icon ? "chrome-back-icon" : "chrome-back"}
      aria-label={icon ? "Back" : undefined}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {icon ? "←" : "← Back"}
    </Link>
  );
}
