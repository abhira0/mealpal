// Pure, DOM-adjacent helpers for the offline banner + SW registration guard.
// Kept dependency-free and framework-agnostic so they're cheap to unit test
// without a DOM environment (see online-status.test.ts).

/** Best-effort current connectivity; defaults to "online" if unknown (SSR). */
export function isOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

/**
 * Subscribes to browser online/offline events. Returns an unsubscribe
 * function. No-op (and returns a no-op cleanup) outside the browser.
 */
export function subscribeOnlineStatus(onChange: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => onChange(true);
  const handleOffline = () => onChange(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/**
 * Guard used before calling navigator.serviceWorker.register(...). Service
 * workers fight hot reload in dev, so this only ever returns true when built
 * for production, in a browser, with SW support.
 */
export function shouldRegisterServiceWorker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    process.env.NODE_ENV === "production"
  );
}
