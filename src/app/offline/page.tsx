// Static fallback shell served by the service worker for navigation requests
// that fail while offline. No data fetching — must render from cache alone.

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="content stack" style={{ paddingTop: 64, textAlign: "center" }}>
      <h1 style={{ fontWeight: 680, fontSize: 22 }}>You&rsquo;re offline</h1>
      <p style={{ color: "var(--ink-2)" }}>
        Platr can&rsquo;t reach the network right now. Once you&rsquo;re back
        online, reload to pick up where you left off.
      </p>
    </div>
  );
}
