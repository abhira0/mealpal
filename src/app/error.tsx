"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app">
      <div className="card" style={{ margin: 16 }}>
        <p className="notice">
          Something went wrong on this page. It&apos;s not you — try again.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn-secondary" href="/">
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
