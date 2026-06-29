"use client";

import { useEffect, useState } from "react";
import { StockAdjust } from "@/components/StockAdjust";
import { Sheet } from "@/components/Sheet";
import { formatQty } from "@/lib/units";

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

type Product = { id: number; name: string; ingredientId: number };

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

        {(() => {
          if (!ingredients) return null;
          const present = ingredients.filter((i) => (stock[String(i.id)] ?? 0) > 0);
          const out = ingredients.filter((i) => (stock[String(i.id)] ?? 0) <= 0);
          // In-stock items whose soonest expiry is within the warning window.
          const expiring = present
            .map((i) => ({ ing: i, exp: expiry[String(i.id)], days: 0 }))
            .filter((e) => e.exp != null)
            .map((e) => ({ ...e, days: daysUntil(e.exp!) }))
            .filter((e) => e.days <= EXPIRY_WARN_DAYS)
            .sort((a, b) => a.days - b.days);
          const row = (ing: Ingredient) => {
            const qty = stock[String(ing.id)] ?? 0;
            const exp = expiry[String(ing.id)];
            return (
              <button
                key={ing.id}
                type="button"
                className="card"
                style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                onClick={() => setEditing(ing)}
              >
                <div className="card-row">
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{ing.name}</span>
                  <span className="meta">{formatQty(qty, ing.canonicalUnit)}</span>
                </div>
                {exp && <p className="meta">soonest expiry · {exp}</p>}
              </button>
            );
          };
          return (
            <>
              {expiring.length > 0 && (
                <>
                  <p className="eb" style={{ color: "var(--paprika)" }}>Use soon</p>
                  {expiring.map(({ ing, exp, days }) => (
                    <button
                      key={`exp-${ing.id}`}
                      type="button"
                      className="card"
                      style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                      onClick={() => setEditing(ing)}
                    >
                      <div className="card-row">
                        <span style={{ fontWeight: 600, fontSize: 16 }}>{ing.name}</span>
                        <span className={`chip ${days <= 3 ? "run" : "low"}`}>
                          {days <= 0 ? "expired" : `${days}d left`}
                        </span>
                      </div>
                      <p className="meta">expires · {exp}</p>
                    </button>
                  ))}
                </>
              )}
              {present.length > 0 && <p className="eb" style={{ marginTop: expiring.length > 0 ? 16 : 0 }}>In stock</p>}
              {present.map(row)}
              {out.length > 0 && <p className="eb" style={{ marginTop: 16 }}>Out of stock</p>}
              {out.map(row)}
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
                <div key={p.id} style={{ marginBottom: 14 }}>
                  <div className="card-row">
                    <span className="body" style={{ color: "var(--sage)" }}>{p.name}</span>
                    <StockAdjust
                      ingredientId={editing.id}
                      productId={p.id}
                      unit={editing.canonicalUnit}
                      current={pq}
                      tone={pq <= 0 ? "low" : "default"}
                      onAdjusted={(delta, e) => applyDelta(editing.id, p.id, delta, e)}
                    />
                  </div>
                  {pe && <p className="meta">expires · {pe}</p>}
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
