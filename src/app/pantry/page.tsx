"use client";

import { useEffect, useState } from "react";
import { StockAdjust } from "@/components/StockAdjust";
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
        setProducts(prods as Product[]);
      })
      .catch(() => setError("Couldn't load the pantry yet."));
  }, []);

  // Adjust an ingredient's total, optionally pinned to a product.
  function applyDelta(ingId: number, productId: number | null, delta: number) {
    setStock((prev) => ({ ...prev, [ingId]: (prev[String(ingId)] ?? 0) + delta }));
    if (productId != null)
      setByProduct((prev) => ({ ...prev, [productId]: (prev[String(productId)] ?? 0) + delta }));
  }

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

        {ingredients?.map((ing) => {
          const qty = stock[String(ing.id)] ?? 0;
          const exp = expiry[String(ing.id)];
          const ingProducts = products.filter((p) => p.ingredientId === ing.id);
          const attributed = ingProducts.reduce((s, p) => s + (byProduct[String(p.id)] ?? 0), 0);
          const unattributed = qty - attributed;
          return (
            <div className="card" key={ing.id}>
              <div className="card-row">
                <span style={{ fontWeight: 600, fontSize: 16 }}>{ing.name}</span>
                <span className="meta" style={{ color: qty <= 0 ? "var(--rust, #b4541f)" : undefined }}>
                  {formatQty(qty, ing.canonicalUnit)}
                </span>
              </div>

              {ingProducts.length === 0 ? (
                // No products to attribute to — adjust the ingredient total directly.
                <div className="card-row" style={{ marginTop: 8 }}>
                  <span className="meta">on hand</span>
                  <StockAdjust
                    ingredientId={ing.id}
                    unit={ing.canonicalUnit}
                    current={qty}
                    tone={qty <= 0 ? "low" : "default"}
                    onAdjusted={(delta, e) => {
                      applyDelta(ing.id, null, delta);
                      if (e) setExpiry((p) => ({ ...p, [ing.id]: e }));
                    }}
                  />
                </div>
              ) : (
                ingProducts.map((p) => {
                  const pq = byProduct[String(p.id)] ?? 0;
                  return (
                    <div className="card-row" key={p.id} style={{ marginTop: 8 }}>
                      <span className="meta">{p.name}</span>
                      <StockAdjust
                        ingredientId={ing.id}
                        productId={p.id}
                        unit={ing.canonicalUnit}
                        current={pq}
                        tone={pq <= 0 ? "low" : "default"}
                        onAdjusted={(delta, e) => {
                          applyDelta(ing.id, p.id, delta);
                          if (e) setExpiry((prev) => ({ ...prev, [ing.id]: e }));
                        }}
                      />
                    </div>
                  );
                })
              )}

              {ingProducts.length > 0 && unattributed > 0 && (
                <p className="meta" style={{ marginTop: 8, opacity: 0.7 }}>
                  unattributed · {formatQty(unattributed, ing.canonicalUnit)}
                </p>
              )}
              {exp && <p className="meta">soonest expiry · {exp}</p>}
            </div>
          );
        })}
      </main>
    </>
  );
}
