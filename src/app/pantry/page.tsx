"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { StockAdjust } from "@/components/StockAdjust";
import { Sheet } from "@/components/Sheet";
import { EditableValue, mmdd } from "@/components/Bill";
import { Dropdown } from "@/components/Dropdown";
import { formatQty } from "@/lib/units";
import { todayISO } from "@/lib/dates";

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

type Product = { id: number; name: string; ingredientId: number; imageUrl: string | null };

type Lot = {
  purchaseId: number;
  expiresAt: string | null;
  remaining: number;
  pricePaidCents: number | null;
  manual: boolean;
};

type NumMap = Record<string, number>;
type ExpiryMap = Record<string, string>;
type LotsMap = Record<string, Lot[]>;

const EXPIRY_WARN_DAYS = 7; // flag food spoiling within a week

// Whole days from today (local) until a YYYY-MM-DD date; negative = already past.
function daysUntil(ymd: string): number {
  return Math.round((Date.parse(ymd) - Date.parse(todayISO())) / 86_400_000);
}

// FEFO order: dated soonest-first, undated last. Mirrors the server's lotsByProduct sort.
function sortLots(arr: Lot[]): Lot[] {
  return [...arr].sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return 0;
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0;
  });
}

export default function PantryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<NumMap>({});
  const [byProduct, setByProduct] = useState<NumMap>({});
  const [expiry, setExpiry] = useState<ExpiryMap>({});
  const [lots, setLots] = useState<LotsMap>({});
  const [editing, setEditing] = useState<Ingredient | null>(null);
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
      })
      .catch(() => setError("Couldn't load the pantry yet."));
  }, [loadStock]);

  // Adjust an ingredient's total, optionally pinned to a product (used by the
  // legacy unattributed StockAdjust and per-lot delta writes).
  function applyDelta(ingId: number, productId: number | null, delta: number, exp: string | null) {
    setStock((prev) => ({ ...prev, [ingId]: (prev[String(ingId)] ?? 0) + delta }));
    if (productId != null) {
      setByProduct((prev) => ({ ...prev, [productId]: (prev[String(productId)] ?? 0) + delta }));
    } else if (exp) {
      setExpiry((prev) => ({ ...prev, [ingId]: exp }));
    }
  }

  // Per-lot correction / trash(zero): stamped to a purchaseId, no FEFO re-allocation.
  async function saveLotDelta(ingId: number, productId: number, purchaseId: number, delta: number) {
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
    } else setError("Couldn't save.");
  }

  // Edit a lot's expiry/price directly (purchases row), independent of the ledger.
  async function patchLot(productId: number, purchaseId: number, patch: { cents?: number; expiresAt?: string | null }) {
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
    } else setError("Couldn't save.");
  }

  // New manual lot ("+ add on-hand"). Creates the lot, then sets its price if one
  // was entered (the add POST has no price field). Resync from the source after.
  async function addOnHand(ingId: number, productId: number, qty: number, exp: string | null, cents: number | null) {
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
  }

  const unsortedEditProducts = editing
    ? products.filter((p) => p.ingredientId === editing.id)
    : [];
  // Products ordered by their soonest lot expiry — the product holding the next batch first.
  const editProducts = [...unsortedEditProducts].sort((a, b) => {
    const ea = (lots[String(a.id)] ?? [])[0]?.expiresAt ?? null;
    const eb = (lots[String(b.id)] ?? [])[0]?.expiresAt ?? null;
    if (!ea && !eb) return 0;
    if (!ea) return 1;
    if (!eb) return -1;
    return ea < eb ? -1 : ea > eb ? 1 : 0;
  });
  const editTotal = editing ? stock[String(editing.id)] ?? 0 : 0;
  const editAttributed = editProducts.reduce((s, p) => s + (byProduct[String(p.id)] ?? 0), 0);
  const editUnattributed = editTotal - editAttributed;

  // The single soonest-expiring lot across all this ingredient's products — gets
  // the "next" badge, but only when there are 2+ lots total (spec, Layout A).
  const allEditLots = editProducts.flatMap((p) => lots[String(p.id)] ?? []);
  const nextLot =
    allEditLots.length >= 2
      ? (allEditLots.filter((l) => l.expiresAt).reduce<Lot | null>(
          (min, l) => (min === null || l.expiresAt! < min.expiresAt! ? l : min),
          null,
        ) ?? allEditLots[0])
      : null;
  // Urgency tone for the "next" badge: paprika ≤3d/expired, turmeric ≤7d, else plain.
  const nextBadgeTone = (exp: string | null) => {
    if (!exp) return "";
    const d = daysUntil(exp);
    if (d <= 3) return " run";
    if (d <= 7) return " low";
    return "";
  };

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
          // # of dated lots across an ingredient's products (for the "N batches" hint).
          const datedLotCount = (ingId: number) =>
            products
              .filter((p) => p.ingredientId === ingId)
              .reduce((s, p) => s + (lots[String(p.id)] ?? []).filter((l) => l.expiresAt).length, 0);
          // Shared row: name (+ optional expiry/batches line) left, status + qty chips right.
          const row = (
            ing: Ingredient,
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

            {/* Only products with lots on hand; empty ones live in the add-on-hand dropdown. */}
            {editProducts
              .filter((p) => (lots[String(p.id)] ?? []).length > 0)
              .map((p) => {
              const productLots = lots[String(p.id)] ?? [];
              return (
                <div key={p.id} className="pantry-prod">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="pantry-prod-img" />}
                  <div className="pantry-prod-info">
                    <span className="body" style={{ color: "var(--sage)" }}>{p.name}</span>
                    <div className="pantry-lots">
                      {productLots.map((lot) => {
                        const isNext = nextLot?.purchaseId === lot.purchaseId;
                        return (
                          <div key={lot.purchaseId} className={`lot-row${lot.remaining < 0 ? " neg" : ""}`}>
                            <div className="hrow-chips">
                              <EditableValue
                                k="×"
                                cls="qty"
                                display={formatQty(lot.remaining, editing.canonicalUnit)}
                                value={String(lot.remaining)}
                                inputMode="decimal"
                                onCommit={(next) => {
                                  const t = Number(next);
                                  if (Number.isFinite(t) && t !== lot.remaining)
                                    saveLotDelta(editing.id, p.id, lot.purchaseId, t - lot.remaining);
                                }}
                              />
                              {isNext && <span className={`chip${nextBadgeTone(lot.expiresAt)}`}>next</span>}
                              <EditableValue
                                k="exp"
                                cls="date"
                                type="date"
                                display={mmdd(lot.expiresAt ?? "")}
                                value={lot.expiresAt ?? ""}
                                onCommit={(next) => patchLot(p.id, lot.purchaseId, { expiresAt: next || null })}
                              />
                              <EditableValue
                                k="$"
                                cls="money"
                                display={lot.pricePaidCents != null ? `$${(lot.pricePaidCents / 100).toFixed(2)}` : "—"}
                                value={lot.pricePaidCents != null ? (lot.pricePaidCents / 100).toFixed(2) : ""}
                                inputMode="decimal"
                                onCommit={(next) => {
                                  const d = Number(next);
                                  if (Number.isFinite(d) && d >= 0) patchLot(p.id, lot.purchaseId, { cents: Math.round(d * 100) });
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="hrow-trash"
                              aria-label={`Remove lot of ${p.name}`}
                              onClick={() => {
                                if (
                                  lot.remaining > 0 &&
                                  !window.confirm(`Remove ${formatQty(lot.remaining, editing.canonicalUnit)} of ${p.name}?`)
                                )
                                  return;
                                saveLotDelta(editing.id, p.id, lot.purchaseId, -lot.remaining);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {editProducts.length > 0 && (
              <AddOnHand
                unit={editing.canonicalUnit}
                products={editProducts}
                onAdd={(productId, qty, exp, cents) => addOnHand(editing.id, productId, qty, exp, cents)}
              />
            )}

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

// Ingredient-level add-on-hand, styled as a blank lot row: blank image, a title
// that IS the product dropdown, and click-to-edit ×/exp/$. The lot is created the
// moment a product AND a positive qty are both set; exp/$ set beforehand ride along.
function AddOnHand({
  unit, products, onAdd,
}: {
  unit: string;
  products: Product[];
  onAdd: (productId: number, qty: number, exp: string | null, cents: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ productId: number | null; qty: number | null; exp: string | null; cents: number | null }>(
    { productId: null, qty: null, exp: null, cents: null },
  );
  const [busy, setBusy] = useState(false);
  const close = () => {
    setDraft({ productId: null, qty: null, exp: null, cents: null });
    setOpen(false);
  };

  // Merge a field change; fire creation once product + positive qty are both present.
  function apply(patch: Partial<typeof draft>) {
    const m = { ...draft, ...patch };
    setDraft(m);
    if (m.productId != null && m.qty != null && m.qty > 0 && !busy) {
      setBusy(true);
      onAdd(m.productId, m.qty, m.exp, m.cents).finally(() => {
        setBusy(false);
        close();
      });
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-link" style={{ padding: "8px 0" }} onClick={() => setOpen(true)}>
        + add on-hand
      </button>
    );
  }

  return (
    <div className="pantry-prod">
      <div className="pantry-prod-img onhand-blank" aria-hidden="true" />
      <div className="pantry-prod-info">
        <div className="onhand-title">
          <Dropdown
            label="Product"
            placeholder="Add on-hand · pick a product"
            value={draft.productId}
            options={products.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(id) => apply({ productId: Number(id) })}
          />
        </div>
        <div className="pantry-lots">
          <div className="lot-row">
            <div className="hrow-chips">
              <EditableValue
                k="×"
                cls="qty"
                display={draft.qty != null ? formatQty(draft.qty, unit) : "—"}
                value={draft.qty != null ? String(draft.qty) : ""}
                inputMode="decimal"
                onCommit={(v) => {
                  const t = Number(v);
                  if (Number.isFinite(t) && t > 0) apply({ qty: t });
                }}
              />
              <EditableValue
                k="exp"
                cls="date"
                type="date"
                display={mmdd(draft.exp ?? "")}
                value={draft.exp ?? ""}
                onCommit={(v) => apply({ exp: v || null })}
              />
              <EditableValue
                k="$"
                cls="money"
                display={draft.cents != null ? `$${(draft.cents / 100).toFixed(2)}` : "—"}
                value={draft.cents != null ? (draft.cents / 100).toFixed(2) : ""}
                inputMode="decimal"
                onCommit={(v) => {
                  const d = Number(v);
                  if (Number.isFinite(d) && d >= 0) apply({ cents: Math.round(d * 100) });
                }}
              />
            </div>
            <button type="button" className="hrow-trash" aria-label="Cancel" onClick={close} disabled={busy}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
