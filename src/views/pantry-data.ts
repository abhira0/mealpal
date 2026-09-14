"use client";

import { useCallback, useEffect, useState } from "react";
import { todayISO } from "@/lib/dates";

export type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

export type Product = { id: number; name: string; ingredientId: number; imageUrl: string | null };

export type Lot = {
  purchaseId: number;
  expiresAt: string | null;
  remaining: number;
  pricePaidCents: number | null;
  manual: boolean;
};

export type NumMap = Record<string, number>;
export type ExpiryMap = Record<string, string>;
export type LotsMap = Record<string, Lot[]>;

export const EXPIRY_WARN_DAYS = 7; // flag food spoiling within a week

// Whole days from today (local) until a YYYY-MM-DD date; negative = already past.
export function daysUntil(ymd: string): number {
  return Math.round((Date.parse(ymd) - Date.parse(todayISO())) / 86_400_000);
}

// FEFO order: dated soonest-first, undated last. Mirrors the server's lotsByProduct sort.
export function sortLots(arr: Lot[]): Lot[] {
  return [...arr].sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return 0;
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0;
  });
}

export type ExpiringEntry = { ing: Ingredient; exp: string | undefined; days: number };

export type PantrySections = {
  expiring: ExpiringEntry[];
  inStock: Ingredient[];
  out: Ingredient[];
  datedLotCount: (ingId: number) => number;
};

/**
 * Shared data + interaction logic for the Pantry page. Consumed by both the
 * mobile and desktop views so the two layouts stay in sync. Only one view
 * mounts at a time (see <Responsive>), so this fetches once per active view.
 */
export function usePantryData() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<NumMap>({});
  const [byProduct, setByProduct] = useState<NumMap>({});
  const [expiry, setExpiry] = useState<ExpiryMap>({});
  const [lots, setLots] = useState<LotsMap>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Pull the whole stock snapshot (totals + per-lot detail). Reused after an
  // add-on-hand write, since the API doesn't hand back the new lot's id.
  const loadStock = useCallback(() => {
    return fetch("/api/stock")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((st) => {
        setStock((st as { qty: NumMap }).qty);
        setByProduct((st as { byProduct: NumMap }).byProduct);
        setExpiry((st as { expiry: ExpiryMap }).expiry);
        setLots((st as { lotsByProduct: LotsMap }).lotsByProduct);
      });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/ingredients").then((r) => (r.ok ? r.json() : Promise.reject())),
      loadStock(),
      fetch("/api/products").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([ings, , prods]) => {
        setIngredients(ings as Ingredient[]);
        setProducts(prods as Product[]);
        setError(null);
      })
      .catch(() => setError("Couldn't load the pantry yet."));
  }, [loadStock]);

  // Adjust an ingredient's total, optionally pinned to a product (used by the
  // legacy unattributed StockAdjust and per-lot delta writes).
  const applyDelta = useCallback(
    (ingId: number, productId: number | null, delta: number, exp: string | null) => {
      setStock((prev) => ({ ...prev, [ingId]: (prev[String(ingId)] ?? 0) + delta }));
      if (productId != null) {
        setByProduct((prev) => ({ ...prev, [productId]: (prev[String(productId)] ?? 0) + delta }));
      } else if (exp) {
        setExpiry((prev) => ({ ...prev, [ingId]: exp }));
      }
    },
    [],
  );

  // Per-lot correction / trash(zero): stamped to a purchaseId, no FEFO re-allocation.
  const saveLotDelta = useCallback(
    async (ingId: number, productId: number, purchaseId: number, delta: number) => {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingredientId: ingId, productId, purchaseId, delta }),
      });
      if (res.ok) {
        applyDelta(ingId, productId, delta, null);
        setLots((prev) => {
          const key = String(productId);
          const next = (prev[key] ?? [])
            .map((l) => (l.purchaseId === purchaseId ? { ...l, remaining: l.remaining + delta } : l))
            .filter((l) => l.remaining !== 0);
          return { ...prev, [key]: next };
        });
        setError(null);
      } else setError("Couldn't save.");
    },
    [applyDelta],
  );

  // Edit a lot's expiry/price directly (purchases row), independent of the ledger.
  const patchLot = useCallback(
    async (
      productId: number,
      purchaseId: number,
      patch: { cents?: number; expiresAt?: string | null },
    ) => {
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setLots((prev) => {
          const key = String(productId);
          let next = (prev[key] ?? []).map((l) =>
            l.purchaseId === purchaseId
              ? {
                  ...l,
                  ...(patch.cents !== undefined ? { pricePaidCents: patch.cents } : {}),
                  ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
                }
              : l,
          );
          if (patch.expiresAt !== undefined) next = sortLots(next);
          return { ...prev, [key]: next };
        });
        setError(null);
      } else setError("Couldn't save.");
    },
    [],
  );

  // New manual lot ("+ add on-hand"). Creates the lot, then sets its price if one
  // was entered (the add POST has no price field). Resync from the source after.
  const addOnHand = useCallback(
    async (
      ingId: number,
      productId: number,
      qty: number,
      exp: string | null,
      cents: number | null,
    ) => {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingredientId: ingId, productId, delta: qty, expiresAt: exp }),
      });
      if (!res.ok) return setError("Couldn't save.");
      if (cents != null) {
        const { purchaseId } = await res.json().catch(() => ({ purchaseId: null }));
        if (purchaseId)
          await fetch(`/api/purchases/${purchaseId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cents }),
          });
      }
      await loadStock();
      setError(null);
    },
    [loadStock],
  );

  // Split the (query-filtered) ingredients into the three pantry sections,
  // plus a helper for the "N batches" hint. Shared by both layouts.
  const categorize = useCallback((): PantrySections => {
    const list = ingredients ?? [];
    const q = query.trim().toLowerCase();
    const matches = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
    const present = matches.filter((i) => (stock[String(i.id)] ?? 0) > 0);
    const out = matches.filter((i) => (stock[String(i.id)] ?? 0) <= 0);
    // In-stock items whose soonest expiry is within the warning window.
    const expiring = present
      .map((i) => ({ ing: i, exp: expiry[String(i.id)], days: 0 }))
      .filter((e) => e.exp != null)
      .map((e) => ({ ...e, days: daysUntil(e.exp!) }))
      .filter((e) => e.days <= EXPIRY_WARN_DAYS)
      .sort((a, b) => a.days - b.days);
    // In-stock minus the ones already surfaced under "Use soon", soonest expiry first (undated last).
    const expiringIds = new Set(expiring.map((e) => e.ing.id));
    const inStock = present
      .filter((i) => !expiringIds.has(i.id))
      .sort((a, b) => {
        const ea = expiry[String(a.id)];
        const eb = expiry[String(b.id)];
        if (!ea) return eb ? 1 : 0;
        if (!eb) return -1;
        return daysUntil(ea) - daysUntil(eb);
      });
    // # of dated lots across an ingredient's products (for the "N batches" hint).
    const datedLotCount = (ingId: number) =>
      products
        .filter((p) => p.ingredientId === ingId)
        .reduce((s, p) => s + (lots[String(p.id)] ?? []).filter((l) => l.expiresAt).length, 0);
    return { expiring, inStock, out, datedLotCount };
  }, [ingredients, query, stock, expiry, products, lots]);

  return {
    ingredients,
    products,
    stock,
    byProduct,
    expiry,
    lots,
    error,
    query,
    setQuery,
    loadStock,
    saveLotDelta,
    patchLot,
    addOnHand,
    applyDelta,
    categorize,
  };
}

export type PantryData = ReturnType<typeof usePantryData>;
