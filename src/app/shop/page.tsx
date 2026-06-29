"use client";

import { useEffect, useMemo, useState } from "react";
import { ShopTicket, type ShopLine, type PriceMap } from "@/components/ShopTicket";
import { Bill } from "@/components/Bill";
import { centsToDollars } from "@/lib/money";

type RawLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  product: { id: number; name: string } | null;
  urgency?: { label: string; tone: "run" | "low" } | null;
};
type ShoppingMap = Record<string, RawLine[]>;

type Product = { id: number; effectiveCents: number | null };
type Ingredient = { id: number; canonicalUnit: string };
type Shop = { id: number; name: string; website: string | null; iconUrl: string | null };

export default function ShopPage() {
  const [data, setData] = useState<ShoppingMap | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [units, setUnits] = useState<Record<number, string>>({});
  const [shopMeta, setShopMeta] = useState<Record<string, Shop>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [horizon, setHorizon] = useState(14);
  const [tab, setTab] = useState<"run" | "bill">("run");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/shopping?horizon=${horizon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j as ShoppingMap))
      .catch(() => setError("Couldn't load the shopping list yet."));
  }, [horizon]);

  useEffect(() => {
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : []))
      .then((p: unknown[]) => setPendingCount(Array.isArray(p) ? p.length : 0))
      .catch(() => {});

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Product[]) =>
        setPrices(Object.fromEntries(products.map((p) => [p.id, p.effectiveCents]))),
      )
      .catch(() => {});

    fetch("/api/ingredients")
      .then((r) => (r.ok ? r.json() : []))
      .then((ings: Ingredient[]) =>
        setUnits(Object.fromEntries(ings.map((i) => [i.id, i.canonicalUnit]))),
      )
      .catch(() => {});

    fetch("/api/shops")
      .then((r) => (r.ok ? r.json() : []))
      .then((shops: Shop[]) =>
        setShopMeta(Object.fromEntries(shops.map((s) => [s.name, s]))),
      )
      .catch(() => {});
  }, []);

  const shops = useMemo(
    () => (data ? Object.entries(data).filter(([, lines]) => lines.length) : []),
    [data],
  );

  function shopTotal(lines: RawLine[]): number {
    return lines.reduce(
      (sum, l) => sum + (l.product ? prices[l.product.id] ?? 0 : 0),
      0,
    );
  }
  const tripTotal = shops.reduce((sum, [, lines]) => sum + shopTotal(lines), 0);

  function toLines(lines: RawLine[]): ShopLine[] {
    return lines.map((l) => ({ ...l, unit: units[l.ingredientId] }));
  }

  const stopCount = shops.length;

  return (
    <>
      <header className="chrome">
        <p className="eb">
          Shop · {stopCount} {stopCount === 1 ? "stop" : "stops"}
          {tripTotal > 0 && <> · ${centsToDollars(tripTotal).toFixed(2)}</>}
        </p>
        <h1>The run</h1>
        <p className="eb" style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          <button
            onClick={() => setTab("run")}
            aria-pressed={tab === "run"}
            style={{ fontWeight: tab === "run" ? 700 : 400, textDecoration: tab === "run" ? "underline" : "none" }}
          >
            The run
          </button>
          <button
            onClick={() => setTab("bill")}
            aria-pressed={tab === "bill"}
            style={{ fontWeight: tab === "bill" ? 700 : 400, textDecoration: tab === "bill" ? "underline" : "none" }}
          >
            Bill{pendingCount > 0 && <> · {pendingCount}</>}
          </button>
        </p>
        {tab === "run" && (
          <p className="eb" style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            Buy ahead
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setHorizon(d)}
                aria-pressed={horizon === d}
                style={{ fontWeight: horizon === d ? 700 : 400, textDecoration: horizon === d ? "underline" : "none" }}
              >
                {d}d
              </button>
            ))}
          </p>
        )}
      </header>

      <main className="content stack">
        {tab === "bill" ? (
          <Bill onCount={setPendingCount} />
        ) : (
          <>
            {error && <p className="notice">{error}</p>}

            {data === null && !error && <p className="loading">Loading…</p>}

            {data && shops.length === 0 && (
              <p className="empty">Nothing to buy — plan some meals first.</p>
            )}

            {shops.map(([shopName, lines]) => {
              const meta = shopMeta[shopName];
              return (
                <ShopTicket
                  key={shopName}
                  shopName={shopName}
                  website={meta?.website}
                  iconUrl={meta?.iconUrl}
                  total={shopTotal(lines)}
                  lines={toLines(lines)}
                  prices={prices}
                />
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
