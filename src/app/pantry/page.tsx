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
              {present.length > 0 && <p className="eb">In stock</p>}
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
