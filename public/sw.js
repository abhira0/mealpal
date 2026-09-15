// Plain, hand-written service worker — no next-pwa, no workbox.
//
// Scope: offline app shell only. Background sync / mutation queueing /
// offline writes are explicitly out of scope (mealpal-49u).
//
// Bump CACHE_VERSION whenever caching logic or the shell list changes; the
// activate handler deletes any cache not matching the current version.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `platr-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// Cacheable at install time: things that don't depend on a live DB query.
// Next.js content-hashes /_next/static/**, so those are safe to cache
// forever; app pages are dynamic and are handled by the fetch handler
// instead (network-first, falling back to OFFLINE_URL).
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add individually so one missing asset (e.g. an icon that doesn't
      // exist in a given build) doesn't fail the whole install.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] failed to precache", url, err);
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("platr-shell-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (page loads): network-first, fall back to the cached
  // offline shell so a dropped connection renders something instead of the
  // browser's own offline error page.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Static, content-hashed build assets: cache-first, they never change
  // under a given hash.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
