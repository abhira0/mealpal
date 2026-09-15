import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app">
      <div className="card" style={{ margin: 16 }}>
        <p className="notice">Page not found.</p>
        <div style={{ marginTop: 12 }}>
          <Link className="btn" href="/">
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
