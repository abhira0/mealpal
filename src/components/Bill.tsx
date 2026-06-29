"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Ticket } from "@/components/ShopTicket";
import { centsToDollars } from "@/lib/money";

type Pending = {
  id: number;
  productName: string;
  shopName: string;
  website: string | null;
  iconUrl: string | null;
  quantity: number;
  expiresAt: string | null;
  hintCents: number | null;
};

export function Bill({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setRows(j as Pending[]);
        onCount?.((j as Pending[]).length);
      })
      .catch(() => setError("Couldn't load the bill."));
    // ponytail: fetch once on mount; tab badge driven via onCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drop(id: number) {
    setRows((rs) => {
      const next = (rs ?? []).filter((r) => r.id !== id);
      onCount?.(next.length);
      return next;
    });
  }

  // group by stop, same shape the run renders
  const stops = useMemo(() => {
    const m = new Map<string, Pending[]>();
    for (const r of rows ?? []) {
      const g = m.get(r.shopName);
      if (g) g.push(r);
      else m.set(r.shopName, [r]);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <>
      {error && <p className="notice">{error}</p>}
      {rows === null && !error && <p className="loading">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="empty">Nothing to price — you&apos;re all caught up.</p>
      )}
      {stops.map(([shopName, group]) => (
        <Ticket
          key={shopName}
          shopName={shopName}
          website={group[0].website}
          iconUrl={group[0].iconUrl}
        >
          {group.map((row) => (
            <BillRow key={row.id} row={row} onSaved={() => drop(row.id)} />
          ))}
        </Ticket>
      ))}
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

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved();
    else setError("Couldn't remove.");
  }

  return (
    <div className="ticket-row">
      <div className="tk-main">
        <div className="tk-name">{row.productName}</div>

        <div className="bill-fields">
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            $
            <input
              className="input mono"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              aria-label={`Price paid for ${row.productName}`}
              style={{ width: 80 }}
            />
          </label>
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            qty
            <input
              className="input mono"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
              aria-label={`Quantity of ${row.productName}`}
              style={{ width: 56 }}
            />
          </label>
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            exp
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-label={`Expiry of ${row.productName}`}
            />
          </label>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Remove ${row.productName} — bought by mistake`}
            style={{ color: "var(--paprika)", display: "inline-flex", alignItems: "center" }}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {error && <div className="eb" style={{ color: "var(--paprika)", marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
