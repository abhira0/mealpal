"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Back chrome that returns to the page you actually came from; the href is the
// fallback for deep links / new tabs with no history to go back to.
// ponytail: history.length is a heuristic — a tab that arrived from another
// site backs out of the app; add a sessionStorage nav counter if that bites.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
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
      {children}
    </Link>
  );
}
