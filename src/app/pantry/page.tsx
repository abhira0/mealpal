"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StockAdjust } from "@/components/StockAdjust";
import { Sheet } from "@/components/Sheet";
import { formatQty } from "@/lib/units";

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

type Product = { id: number; name: string; ingredientId: number; imageUrl: string | null };

type NumMap = Record<string, number>;
type ExpiryMap = Record<string, string>;

const EXPIRY_WARN_DAYS = 7; // flag food spoiling within a week

// Whole days from today (local) until a YYYY-MM-DD date; negative = already past.
function daysUntil(ymd: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(ymd) - Date.parse(today)) / 86_400_000);
}

export default function PantryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<NumMap>({});
  const [byProduct, setByProduct] = useState<NumMap>({});
  const [expiry, setExpiry] = useState<ExpiryMap>({});
  const [prodExpiry, setProdExpiry] = useState<ExpiryMap>({});
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/ingredients").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/stock").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/products").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([ings, st, prods]) => {
        setIngredients(ings as Ingredient[]);
        setStock((st as { qty: NumMap }).qty);
        setByProduct((st as { byProduct: NumMap }).byProduct);
        setExpiry((st as { expiry: ExpiryMap }).expiry);
        setProdExpiry((st as { expiryByProduct: ExpiryMap }).expiryByProduct);
        setProducts(prods as Product[]);
      })
      .catch(() => setError("Couldn't load the pantry yet."));
  }, []);

  // Adjust an ingredient's total, optionally pinned to a product.
  function applyDelta(ingId: number, productId: number | null, delta: number, exp: string | null) {
    setStock((prev) => ({ ...prev, [ingId]: (prev[String(ingId)] ?? 0) + delta }));
    if (productId != null) {
      setByProduct((prev) => ({ ...prev, [productId]: (prev[String(productId)] ?? 0) + delta }));
      if (exp) setProdExpiry((prev) => ({ ...prev, [productId]: exp }));
    } else if (exp) {
      setExpiry((prev) => ({ ...prev, [ingId]: exp }));
    }
  }

  const editProducts = editing
    ? products.filter((p) => p.ingredientId === editing.id)
    : [];
  const editTotal = editing ? stock[String(editing.id)] ?? 0 : 0;
  const editAttributed = editProducts.reduce((s, p) => s + (byProduct[String(p.id)] ?? 0), 0);
  const editUnattributed = editTotal - editAttributed;

  return (
    <>
      <header className="chrome">
        <p className="eb">Pantry</p>
        <h1>What&apos;s in stock</h1>
      </header>

      <main className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        {ingredients === null && !error && <p className="loading">Loading…</p>}

        {ingredients && ingredients.length === 0 && (
          <p className="empty">No ingredients yet.</p>
        )}

        {ingredients && ingredients.length > 0 && (
          <input
            type="search"
            className="input"
            placeholder="Search pantry…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {(() => {
          if (!ingredients) return null;
          const q = query.trim().toLowerCase();
          const matches = q
            ? ingredients.filter((i) => i.name.toLowerCase().includes(q))
            : ingredients;
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
          // Shared row: name (+ optional expiry line) left, status + qty chips right.
          const row = (
            ing: Ingredient,
            opts: { statusChip?: ReactNode; showExp?: boolean; dim?: boolean } = {},
          ) => {
            const qty = stock[String(ing.id)] ?? 0;
            const exp = expiry[String(ing.id)];
            return (
              <button
                key={ing.id}
                type="button"
                className={`card pantry-row${opts.dim ? " out" : ""}`}
                onClick={() => setEditing(ing)}
              >
                <div className="p-main">
                  <span className="title">{ing.name}</span>
                  {opts.showExp && exp && <p className="meta">expires · {exp}</p>}
                </div>
                <div className="p-right">
                  {opts.statusChip}
                  <span className="chip qty">{formatQty(qty, ing.canonicalUnit)}</span>
                </div>
              </button>
            );
          };
          return (
            <>
              {expiring.length > 0 && (
                <>
                  <p className="section-label">Use soon · {expiring.length}</p>
                  {expiring.map(({ ing, days }) =>
                    row(ing, {
                      showExp: true,
                      statusChip: (
                        <span className={`chip ${days <= 3 ? "run" : "low"}`}>
                          {days <= 0 ? "expired" : `${days}d`}
                        </span>
                      ),
                    }),
                  )}
                </>
              )}
              {inStock.length > 0 && (
                <p className="section-label">In stock · {inStock.length}</p>
              )}
              {inStock.map((ing) => row(ing, { showExp: true }))}
              {out.length > 0 && (
                <p className="section-label">Out of stock · {out.length}</p>
              )}
              {out.map((ing) =>
                row(ing, { dim: true, statusChip: <span className="chip">out</span> }),
              )}
            </>
          );
        })()}
      </main>

      <Sheet
        open={editing !== null}
        title={editing?.name ?? ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="sh-body">
            {editProducts.length === 0 && (
              <p className="meta">No products for this ingredient.</p>
            )}

            {editProducts.map((p) => {
              const pq = byProduct[String(p.id)] ?? 0;
              const pe = prodExpiry[String(p.id)];
              return (
                <div key={p.id} className="pantry-prod">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="pantry-prod-img" />}
                  <div className="pantry-prod-info">
                    <span className="body" style={{ color: "var(--sage)" }}>{p.name}</span>
                    <div className="pantry-prod-row2">
                      <StockAdjust
                        ingredientId={editing.id}
                        productId={p.id}
                        unit={editing.canonicalUnit}
                        current={pq}
                        tone={pq <= 0 ? "low" : "default"}
                        onAdjusted={(delta, e) => applyDelta(editing.id, p.id, delta, e)}
                      />
                      {pe && <p className="meta">expires · {pe}</p>}
                    </div>
                  </div>
                </div>
              );
            })}

            {editUnattributed > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="card-row">
                  <span className="body" style={{ color: "var(--sage)", opacity: 0.7 }}>
                    Unattributed
                  </span>
                  <StockAdjust
                    ingredientId={editing.id}
                    unit={editing.canonicalUnit}
                    current={editUnattributed}
                    tone="default"
                    onAdjusted={(delta, e) => applyDelta(editing.id, null, delta, e)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
