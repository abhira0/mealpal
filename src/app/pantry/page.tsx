"use client";

import { useEffect, useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
import { StockAdjust } from "@/components/StockAdjust";
import { formatQty } from "@/lib/units";

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
  servingSize: number | null;
};

type StockMap = Record<string, number>;

export default function PantryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [stock, setStock] = useState<StockMap>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/ingredients").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/stock").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([ings, st]) => {
        setIngredients(ings as Ingredient[]);
        setStock(st as StockMap);
      })
      .catch(() => setError("Couldn't load the pantry yet."));
  }, []);

  function applyDelta(id: number, delta: number) {
    setStock((prev) => ({ ...prev, [id]: (prev[String(id)] ?? 0) + delta }));
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
          // Low when current stock is below one serving; if no servingSize,
          // low only when fully out.
          const low = ing.servingSize != null ? qty < ing.servingSize : qty <= 0;
          return (
            <div className="card" key={ing.id}>
              <div className="card-row">
                <span style={{ fontWeight: 600, fontSize: 16 }}>{ing.name}</span>
                <QuantityChip
                  value={formatQty(qty, ing.canonicalUnit)}
                  tone={low ? "low" : "default"}
                />
              </div>
              <StockAdjust
                ingredientId={ing.id}
                unit={ing.canonicalUnit}
                onAdjusted={(delta) => applyDelta(ing.id, delta)}
              />
            </div>
          );
        })}
      </main>
    </>
  );
}
