"use client";

import { useEffect, useState } from "react";
import { ShopTicket, type ShopLine } from "@/components/ShopTicket";

type ShoppingMap = Record<string, ShopLine[]>;

function rangeISO(): { from: string; to: string } {
  const d = new Date();
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { from, to: end.toISOString().slice(0, 10) };
}

export default function ShopPage() {
  const [data, setData] = useState<ShoppingMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { from, to } = rangeISO();
    fetch(`/api/shopping?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j as ShoppingMap))
      .catch(() => setError("Couldn't load the shopping list yet."));
  }, []);

  const shops = data ? Object.entries(data).filter(([, lines]) => lines.length) : [];

  return (
    <main className="app-main">
      <div className="page-header">
        <p className="eyebrow">Shop</p>
        <h1>The shopping run</h1>
      </div>

      {error && <p className="error">{error}</p>}

      {data && shops.length === 0 && (
        <div className="empty-state">
          <p>Nothing to buy — plan some meals first.</p>
        </div>
      )}

      {shops.map(([shopName, lines]) => (
        <ShopTicket key={shopName} shopName={shopName} lines={lines} />
      ))}
    </main>
  );
}
