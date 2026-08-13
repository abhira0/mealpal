"use client";

import { useState, type ReactNode } from "react";
import { DeskPage } from "@/components/DeskPage";
import { formatQty } from "@/lib/units";
import { PantryDetail } from "@/views/PantryDetail";
import { usePantryData, type Ingredient } from "@/views/pantry-data";

export function DesktopPantry() {
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
  const [selected, setSelected] = useState<Ingredient | null>(null);

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
    const isSelected = selected?.id === ing.id;
    return (
      <button
        key={ing.id}
        type="button"
        className={`card pantry-row${opts.dim ? " out" : ""}${isSelected ? " is-selected" : ""}`}
        aria-current={isSelected ? "true" : undefined}
        onClick={() => setSelected(ing)}
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
    <DeskPage title="Pantry" testId="desktop-pantry">
      <div className="md-layout" data-testid="md-layout">
        <div className="md-list stack-sm">
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
                    <p className="section-label">Out of stock · {out.length}</p>
                  )}
                  {out.map((ing) =>
                    row(ing, datedLotCount, { dim: true, statusChip: <span className="chip">out</span> }),
                  )}
                </>
              );
            })()}
          </div>
          <aside className="md-pane" data-testid="md-pane">
            {selected ? (
              <PantryDetail
                key={selected.id}
                ingredient={selected}
                products={products}
                lots={lots}
                byProduct={byProduct}
                stock={stock}
                onSaveLotDelta={saveLotDelta}
                onPatchLot={patchLot}
                onAddOnHand={addOnHand}
                onApplyDelta={applyDelta}
              />
            ) : (
              <div className="md-pane-empty">Select an ingredient.</div>
            )}
        </aside>
      </div>
    </DeskPage>
  );
}
