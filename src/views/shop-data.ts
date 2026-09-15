"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShopLine, PriceMap } from "@/components/ShopTicket";
import { packsNeeded } from "@/lib/units";

export type RawLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  product: { id: number; name: string; packSize?: number } | null;
  urgency?: { label: string; tone: "run" | "low" } | null;
  extraId?: number;
};
export type ShoppingMap = Record<string, RawLine[]>;

/**
 * Total cost (cents) of a set of shopping lines: each line's product price
 * multiplied by the whole packs needed to cover `needed` — a multi-pack line
 * (e.g. needing 2 packs of a 500g product) must count both packs, not just one.
 */
export function sumLines(lines: RawLine[], prices: PriceMap): number {
  return lines.reduce((sum, l) => {
    if (!l.product) return sum;
    const cents = prices[l.product.id] ?? 0;
    const packs = l.product.packSize ? packsNeeded(l.needed, l.product.packSize) : 1;
    return sum + cents * packs;
  }, 0);
}

export type Product = { id: number; name: string; effectiveCents: number | null };
type Ingredient = { id: number; canonicalUnit: string };
export type Shop = { id: number; name: string; website: string | null; iconUrl: string | null };

/**
 * Shared data + interaction logic for the Shop page. Consumed by both the
 * mobile and desktop views so the two layouts stay in sync. Only one view
 * mounts at a time (see <Responsive>), so this fetches once per active view.
 */
export function useShopData() {
  const [data, setData] = useState<ShoppingMap | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Record<number, string>>({});
  const [shopMeta, setShopMeta] = useState<Record<string, Shop>>({});
  const [pendingCount, setPendingCount] = useState(0);
  // lineKey -> purchase id; lives here so checks survive the Bill tab round-trip.
  const [struck, setStruck] = useState<Map<string, number | null>>(new Map());
  const [horizon, setHorizon] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"shop" | "cost">("shop");

  const loadShopping = useCallback(() => {
    setData(null);
    setError(null);
    fetch(`/api/shopping?horizon=${horizon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j as ShoppingMap))
      .catch(() => setError("Couldn't load the shopping list yet."));
  }, [horizon]);

  useEffect(() => {
    loadShopping();
  }, [loadShopping]);

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

  const shopTotal = useCallback((lines: RawLine[]): number => sumLines(lines, prices), [prices]);

  const tripTotal = shops.reduce((sum, [, lines]) => sum + shopTotal(lines), 0);

  // Search filters each shop's lines down to matching ingredients/products
  // (dropping shops left with none); sort reorders the remaining stops.
  const shownShops = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered: [string, RawLine[]][] = q
      ? shops
          .map(
            ([name, lines]) =>
              [
                name,
                lines.filter(
                  (l) =>
                    l.ingredientName.toLowerCase().includes(q) ||
                    (l.product?.name.toLowerCase().includes(q) ?? false),
                ),
              ] as [string, RawLine[]],
          )
          .filter(([, lines]) => lines.length > 0)
      : shops;
    const sorted = [...filtered];
    if (sort === "shop") sorted.sort(([a], [b]) => a.localeCompare(b));
    else sorted.sort((a, b) => shopTotal(b[1]) - shopTotal(a[1]));
    return sorted;
  }, [shops, query, sort, shopTotal]);

  const toLines = useCallback(
    (lines: RawLine[]): ShopLine[] =>
      lines.map((l) => ({ ...l, unit: units[l.ingredientId] })),
    [units],
  );

  const handleStruck = useCallback(
    (key: string, next: boolean, purchaseId: number | null) => {
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
    },
    [struck],
  );

  return {
    data,
    prices,
    products,
    units,
    shopMeta,
    pendingCount,
    setPendingCount,
    struck,
    horizon,
    setHorizon,
    error,
    loadShopping,
    shops,
    shopTotal,
    tripTotal,
    toLines,
    handleStruck,
    stopCount: shops.length,
    query,
    setQuery,
    sort,
    setSort,
    shownShops,
  };
}
