"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Back chrome that returns to the page you actually came from; the href is the
// fallback for deep links / new tabs with no history to go back to.
// ponytail: history.length is a heuristic — a tab that arrived from another
// site backs out of the app; add a sessionStorage nav counter if that bites.
// Label is always "Back" — the destination varies with history, so naming a
// page (e.g. "← Products") would be wrong whenever you arrived from elsewhere.
export function BackLink({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className="chrome-back"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      ← Back
    </Link>
  );
}
