"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { formatQty } from "@/lib/units";
import { PantryDetail } from "@/views/PantryDetail";
import { usePantryData, type Ingredient } from "@/views/pantry-data";

export function MobilePantry() {
  const {
    ingredients,
    products,
    stock,
    byProduct,
    expiry,
    lots,
    error,
    query,
    setQuery,
    saveLotDelta,
    patchLot,
    addOnHand,
    applyDelta,
    categorize,
  } = usePantryData();
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [showOut, setShowOut] = useState(false);

  // Shared row: name (+ optional expiry/batches line) left, status + qty chips right.
  const row = (
    ing: Ingredient,
    datedLotCount: (ingId: number) => number,
    opts: { statusChip?: ReactNode; showExp?: boolean; dim?: boolean } = {},
  ) => {
    const qty = stock[String(ing.id)] ?? 0;
    const exp = expiry[String(ing.id)];
    const batches = datedLotCount(ing.id);
    const metaParts = [
      ...(opts.showExp && exp ? [`expires · ${exp}`] : []),
      ...(batches >= 2 ? [`${batches} batches`] : []),
    ];
    return (
      <button
        key={ing.id}
        type="button"
        className={`card pantry-row${opts.dim ? " out" : ""}`}
        onClick={() => setEditing(ing)}
      >
        <div className="p-main">
          <span className="title">{ing.name}</span>
          {metaParts.length > 0 && <p className="meta">{metaParts.join(" · ")}</p>}
        </div>
        <div className="p-right">
          {opts.statusChip}
          <span className="chip qty">{formatQty(qty, ing.canonicalUnit)}</span>
        </div>
      </button>
    );
  };

  return (
    <div data-testid="mobile-pantry">
      <header className="chrome">
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
          const { expiring, inStock, out, datedLotCount } = categorize();
          return (
            <>
              {expiring.length > 0 && (
                <>
                  <p className="section-label">Use soon · {expiring.length}</p>
                  {expiring.map(({ ing, days }) =>
                    row(ing, datedLotCount, {
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
              {inStock.map((ing) => row(ing, datedLotCount, { showExp: true }))}
              {out.length > 0 && (
                <button
                  type="button"
                  className="section-label section-toggle"
                  aria-expanded={showOut}
                  onClick={() => setShowOut((v) => !v)}
                >
                  Out of stock · {out.length} {showOut ? "▾" : "▸"}
                </button>
              )}
              {showOut &&
                out.map((ing) =>
                  row(ing, datedLotCount, { dim: true, statusChip: <span className="chip">out</span> }),
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
          <PantryDetail
            ingredient={editing}
            products={products}
            lots={lots}
            byProduct={byProduct}
            stock={stock}
            onSaveLotDelta={saveLotDelta}
            onPatchLot={patchLot}
            onAddOnHand={addOnHand}
            onApplyDelta={applyDelta}
          />
        )}
      </Sheet>
    </div>
  );
}
