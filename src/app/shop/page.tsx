"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShopTicket, type ShopLine, type PriceMap } from "@/components/ShopTicket";
import { Bill } from "@/components/Bill";
import { AddExtra } from "@/components/AddExtra";
import { centsToDollars } from "@/lib/money";

type RawLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  product: { id: number; name: string } | null;
  urgency?: { label: string; tone: "run" | "low" } | null;
  extraId?: number;
};
type ShoppingMap = Record<string, RawLine[]>;

type Product = { id: number; name: string; effectiveCents: number | null };
type Ingredient = { id: number; canonicalUnit: string };
type Shop = { id: number; name: string; website: string | null; iconUrl: string | null };

export default function ShopPage() {
  const [data, setData] = useState<ShoppingMap | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Record<number, string>>({});
  const [shopMeta, setShopMeta] = useState<Record<string, Shop>>({});
  const [pendingCount, setPendingCount] = useState(0);
  // lineKey -> purchase id; lives here so checks survive the Bill tab round-trip.
  const [struck, setStruck] = useState<Map<string, number | null>>(new Map());
  const [horizon, setHorizon] = useState(14);
  const [tab, setTab] = useState<"run" | "bill">("run");
  const [error, setError] = useState<string | null>(null);

  const loadShopping = useCallback(() => {
    setData(null);
    fetch(`/api/shopping?horizon=${horizon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j as ShoppingMap))
      .catch(() => setError("Couldn't load the shopping list yet."));
  }, [horizon]);

  useEffect(() => { loadShopping(); }, [loadShopping]);

  useEffect(() => {
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : []))
      .then((p: unknown[]) => setPendingCount(Array.isArray(p) ? p.length : 0))
      .catch(() => {});

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: Product[]) => {
        setProducts(ps);
        setPrices(Object.fromEntries(ps.map((p) => [p.id, p.effectiveCents])));
      })
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

  function handleStruck(key: string, next: boolean, purchaseId: number | null) {
    setStruck((prev) => {
      const m = new Map(prev);
      if (next) m.set(key, purchaseId);
      else m.delete(key);
      return m;
    });
    // Keep the Bill badge live: recording a purchase +1, undoing one -1.
    if (next) {
      if (purchaseId != null) setPendingCount((c) => c + 1);
    } else if (struck.get(key) != null) {
      setPendingCount((c) => Math.max(0, c - 1));
    }
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
      </header>

      <main className="content stack">
        <div className="tabs" role="tablist">
          <button role="tab" onClick={() => setTab("run")} aria-pressed={tab === "run"}>
            The run
          </button>
          <button role="tab" onClick={() => setTab("bill")} aria-pressed={tab === "bill"}>
            Bill{pendingCount > 0 && <> · {pendingCount}</>}
          </button>
        </div>

        {tab === "bill" ? (
          <Bill onCount={setPendingCount} />
        ) : (
          <>
            <div className="filter">
              <span className="lbl">Buy ahead</span>
              {[7, 14, 30, 60, 90].map((d) => (
                <button key={d} onClick={() => setHorizon(d)} aria-pressed={horizon === d}>
                  {d}d
                </button>
              ))}
            </div>

            {error && <p className="notice">{error}</p>}

            {data === null && !error && <p className="loading">Loading…</p>}

            {data && shops.length === 0 && (
              <p className="empty">Nothing to buy — plan some meals first.</p>
            )}

            <AddExtra
              products={products}
              shops={Object.values(shopMeta)}
              onAdded={loadShopping}
            />

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
                  struck={struck}
                  onStruck={handleStruck}
                />
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
