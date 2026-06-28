"use client";

import { useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
import { dollarsToCents } from "@/lib/money";

export type ShopLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  unit?: string;
  product: { id: number; name: string } | null;
};

export function ShopTicket({
  shopName,
  lines,
}: {
  shopName: string;
  lines: ShopLine[];
}) {
  const [bought, setBought] = useState<Set<number>>(new Set());

  return (
    <div className="ticket">
      <h2 className="ticket__title">{shopName}</h2>
      <div className="stack">
        {lines.map((line) =>
          bought.has(line.ingredientId) ? null : (
            <ShopLineRow
              key={line.ingredientId}
              line={line}
              onBought={() =>
                setBought((prev) => new Set(prev).add(line.ingredientId))
              }
            />
          ),
        )}
        {lines.every((l) => bought.has(l.ingredientId)) && (
          <p className="caption">All checked off here. Nice run.</p>
        )}
      </div>
    </div>
  );
}

function ShopLineRow({
  line,
  onBought,
}: {
  line: ShopLine;
  onBought: () => void;
}) {
  const [pricing, setPricing] = useState(false);
  const [dollars, setDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!line.product) return;
    const amount = Number(dollars);
    if (!Number.isFinite(amount)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: line.product.id,
        quantity: 1,
        dollars: amount,
        cents: dollarsToCents(amount),
      }),
    });
    setBusy(false);
    if (res.ok) {
      onBought();
    } else {
      setError("Could not record purchase.");
    }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
      <div className="row-between">
        <label className="row" style={{ flex: 1, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={pricing}
            onChange={(e) => setPricing(e.target.checked)}
            style={{ width: 22, height: 22, minHeight: 22 }}
            aria-label={`Mark ${line.ingredientName} bought`}
          />
          <span>
            <span style={{ fontWeight: 600 }}>{line.ingredientName}</span>
            {line.product && (
              <span className="caption" style={{ display: "block" }}>
                {line.product.name}
              </span>
            )}
            {!line.product && (
              <span className="caption" style={{ display: "block" }}>
                No product on file
              </span>
            )}
          </span>
        </label>
        <QuantityChip value={formatNeeded(line)} tone="default" />
      </div>

      {pricing && line.product && (
        <form onSubmit={buy} className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="$ paid"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            aria-label="Price paid in dollars"
            style={{ width: 120 }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "…" : "Record"}
          </button>
        </form>
      )}
      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}

function formatNeeded(line: ShopLine): string {
  const n = Number.isInteger(line.needed)
    ? String(line.needed)
    : String(Math.round(line.needed * 100) / 100);
  return line.unit ? `${n} ${line.unit}` : n;
}
