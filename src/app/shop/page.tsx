"use client";

import { useEffect, useMemo, useState } from "react";
import { ShopTicket, type ShopLine, type PriceMap } from "@/components/ShopTicket";
import { centsToDollars } from "@/lib/money";

type RawLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  product: { id: number; name: string } | null;
};
type ShoppingMap = Record<string, RawLine[]>;

type Product = {
  id: number;
  effectiveCents: number | null;
};

type Ingredient = { id: number; canonicalUnit: string };

export default function ShopPage() {
  const [data, setData] = useState<ShoppingMap | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [units, setUnits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shopping")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j as ShoppingMap))
      .catch(() => setError("Couldn't load the shopping list yet."));

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Product[]) =>
        setPrices(
          Object.fromEntries(products.map((p) => [p.id, p.effectiveCents])),
        ),
      )
      .catch(() => {});

    fetch("/api/ingredients")
      .then((r) => (r.ok ? r.json() : []))
      .then((ings: Ingredient[]) =>
        setUnits(Object.fromEntries(ings.map((i) => [i.id, i.canonicalUnit]))),
      )
      .catch(() => {});
  }, []);

  const shops = useMemo(
    () => (data ? Object.entries(data).filter(([, lines]) => lines.length) : []),
    [data],
  );

  // Per-shop running total (sum of suggested product prices), and trip total.
  function shopTotal(lines: RawLine[]): number {
    return lines.reduce(
      (sum, l) => sum + (l.product ? prices[l.product.id] ?? 0 : 0),
      0,
    );
  }
  const tripTotal = shops.reduce((sum, [, lines]) => sum + shopTotal(lines), 0);

  function toLines(lines: RawLine[]): ShopLine[] {
    return lines.map((l) => ({
      ...l,
      unit: units[l.ingredientId],
    }));
  }

  const stopCount = shops.length;

  return (
    <div className="app">
      <header className="chrome">
        <p className="eb">
          Shop · {stopCount} {stopCount === 1 ? "stop" : "stops"}
          {tripTotal > 0 && <> · ${centsToDollars(tripTotal).toFixed(2)}</>}
        </p>
        <h1>The run</h1>
      </header>

      <main style={{ padding: "0 16px 16px" }}>
        {error && (
          <p className="eb" style={{ color: "var(--paprika)", marginTop: 16 }}>
            {error}
          </p>
        )}

        {data && shops.length === 0 && (
          <p style={{ color: "var(--sage)", fontSize: 14, marginTop: 16 }}>
            Nothing to buy — plan some meals first.
          </p>
        )}

        {shops.map(([shopName, lines]) => (
          <ShopTicket
            key={shopName}
            shopName={shopName}
            total={shopTotal(lines)}
            lines={toLines(lines)}
            prices={prices}
          />
        ))}
      </main>
    </div>
  );
}
