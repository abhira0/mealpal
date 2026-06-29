"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/money";

type Pending = {
  id: number;
  productName: string;
  quantity: number;
  expiresAt: string | null;
  hintCents: number | null;
};

export default function BillPage() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setRows(j as Pending[]))
      .catch(() => setError("Couldn't load the bill."));
  }, []);

  const count = rows?.length ?? 0;

  return (
    <>
      <header className="chrome">
        <Link href="/shop" className="chrome-back">← The run</Link>
        <p className="eb">{count} {count === 1 ? "item" : "items"} to price</p>
        <h1>Enter the bill</h1>
      </header>

      <main className="content stack">
        {error && <p className="notice">{error}</p>}
        {rows === null && !error && <p className="loading">Loading…</p>}
        {rows && rows.length === 0 && (
          <p className="empty">Nothing to price — you&apos;re all caught up.</p>
        )}
        {rows?.map((row) => (
          <BillRow
            key={row.id}
            row={row}
            onSaved={() => setRows((rs) => (rs ?? []).filter((r) => r.id !== row.id))}
          />
        ))}
      </main>
    </>
  );
}

function BillRow({ row, onSaved }: { row: Pending; onSaved: () => void }) {
  const [dollars, setDollars] = useState(
    row.hintCents != null ? centsToDollars(row.hintCents).toFixed(2) : "",
  );
  const [expiresAt, setExpiresAt] = useState(row.expiresAt ?? "");
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amount = Number(dollars);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a price.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dollars: amount,
        expiresAt: expiresAt || null,
        quantity: Number(quantity) || 1,
      }),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else setError("Couldn't save.");
  }

  return (
    <div className="card stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <strong>{row.productName}</strong>
        <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          qty
          <input
            className="input mono"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: 56 }}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Price paid</span>
        <span className="input mono" style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={{ color: "var(--sage)", marginRight: 2 }}>$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
            aria-label="Price paid in dollars"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "inherit", color: "inherit" }}
          />
        </span>
      </label>

      <label className="field">
        <span className="field-label">Expires · optional</span>
        <input
          className="input"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </label>

      <button type="button" className="btn block" onClick={save} disabled={busy}>
        {busy ? "…" : "Save"}
      </button>
      {error && <p className="eb" style={{ color: "var(--paprika)" }}>{error}</p>}
    </div>
  );
}
