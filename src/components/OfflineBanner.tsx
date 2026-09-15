"use client";

import { useSyncExternalStore } from "react";
import { isOnline, subscribeOnlineStatus } from "@/lib/online-status";

// useSyncExternalStore (not a setState-in-effect) reads navigator.onLine
// directly and re-renders on browser online/offline events — no risk of a
// hydration flash and no lint violation for setState-in-effect.
function subscribe(callback: () => void) {
  return subscribeOnlineStatus(() => callback());
}

// Server has no navigator; assume online so SSR never renders the banner.
function getServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, isOnline, getServerSnapshot);

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You&rsquo;re offline — changes won&rsquo;t save until you reconnect.
    </div>
  );
}
