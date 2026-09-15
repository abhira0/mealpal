"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { StockAdjust } from "@/components/StockAdjust";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProductImage } from "@/components/ProductImage";
import { EditableValue, mmdd } from "@/components/Bill";
import { Dropdown } from "@/components/Dropdown";
import { formatQty } from "@/lib/units";
import { daysUntil } from "@/views/pantry-data";
import type { Ingredient, Product, Lot, NumMap, LotsMap } from "@/views/pantry-data";

type PantryDetailProps = {
  ingredient: Ingredient;
  products: Product[];
  lots: LotsMap;
  byProduct: NumMap;
  stock: NumMap;
  onSaveLotDelta: (ingId: number, productId: number, purchaseId: number, delta: number) => void;
  onPatchLot: (
    productId: number,
    purchaseId: number,
    patch: { cents?: number; expiresAt?: string | null },
  ) => void;
  onAddOnHand: (
    ingId: number,
    productId: number,
    qty: number,
    exp: string | null,
    cents: number | null,
  ) => Promise<void>;
  onApplyDelta: (ingId: number, productId: number | null, delta: number, exp: string | null) => void;
  // Bumped by the desktop "n" shortcut (DesktopShortcuts.tsx) to open the
  // add-on-hand form the same way clicking "+ add on-hand" does. Unused on
  // mobile, where there's no keyboard shortcut layer.
  newTrigger?: number;
};

/**
 * The lot editor for a single ingredient: per-product lots, add-on-hand, and the
 * unattributed StockAdjust. Presentational — contains NO Sheet; it's the shared
 * body content for both the mobile bottom sheet and the desktop detail pane.
 */
export function PantryDetail({
  ingredient,
  products,
  lots,
  byProduct,
  stock,
  onSaveLotDelta,
  onPatchLot,
  onAddOnHand,
  onApplyDelta,
  newTrigger,
}: PantryDetailProps) {
  const confirm = useConfirm();
  const unsortedEditProducts = products.filter((p) => p.ingredientId === ingredient.id);
  // Products ordered by their soonest lot expiry — the product holding the next batch first.
  const editProducts = [...unsortedEditProducts].sort((a, b) => {
    const ea = (lots[String(a.id)] ?? [])[0]?.expiresAt ?? null;
    const eb = (lots[String(b.id)] ?? [])[0]?.expiresAt ?? null;
    if (!ea && !eb) return 0;
    if (!ea) return 1;
    if (!eb) return -1;
    return ea < eb ? -1 : ea > eb ? 1 : 0;
  });
  const editTotal = stock[String(ingredient.id)] ?? 0;
  const editAttributed = editProducts.reduce((s, p) => s + (byProduct[String(p.id)] ?? 0), 0);
  const editUnattributed = editTotal - editAttributed;

  // The single soonest-expiring lot across all this ingredient's products — gets
  // the "next" badge, but only when there are 2+ lots total (spec, Layout A) AND
  // at least one of them is actually dated — badging an arbitrary undated lot
  // "next" would imply an eat-first priority the data doesn't support.
  const allEditLots = editProducts.flatMap((p) => lots[String(p.id)] ?? []);
  const nextLot =
    allEditLots.length >= 2
      ? allEditLots.filter((l) => l.expiresAt).reduce<Lot | null>(
          (min, l) => (min === null || l.expiresAt! < min.expiresAt! ? l : min),
          null,
        )
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
              {p.imageUrl && (
                <ProductImage src={p.imageUrl} alt={p.name} width={64} height={64} className="pantry-prod-img" />
              )}
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
                            display={formatQty(lot.remaining, ingredient.canonicalUnit)}
                            value={String(lot.remaining)}
                            inputMode="decimal"
                            onCommit={(next) => {
                              const t = Number(next);
                              if (Number.isFinite(t) && t !== lot.remaining)
                                onSaveLotDelta(ingredient.id, p.id, lot.purchaseId, t - lot.remaining);
                            }}
                          />
                          {isNext && <span className={`chip${nextBadgeTone(lot.expiresAt)}`}>next</span>}
                          <EditableValue
                            k="exp"
                            cls="date"
                            type="date"
                            display={mmdd(lot.expiresAt ?? "")}
                            value={lot.expiresAt ?? ""}
                            onCommit={(next) => onPatchLot(p.id, lot.purchaseId, { expiresAt: next || null })}
                          />
                          <EditableValue
                            k="$"
                            cls="money"
                            display={lot.pricePaidCents != null ? `$${(lot.pricePaidCents / 100).toFixed(2)}` : "—"}
                            value={lot.pricePaidCents != null ? (lot.pricePaidCents / 100).toFixed(2) : ""}
                            inputMode="decimal"
                            onCommit={(next) => {
                              const d = Number(next);
                              if (Number.isFinite(d) && d >= 0) onPatchLot(p.id, lot.purchaseId, { cents: Math.round(d * 100) });
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="hrow-trash"
                          aria-label={`Remove lot of ${p.name}`}
                          onClick={async () => {
                            if (
                              lot.remaining > 0 &&
                              !(await confirm(`Remove ${formatQty(lot.remaining, ingredient.canonicalUnit)} of ${p.name}?`))
                            )
                              return;
                            onSaveLotDelta(ingredient.id, p.id, lot.purchaseId, -lot.remaining);
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
          unit={ingredient.canonicalUnit}
          products={editProducts}
          onAdd={(productId, qty, exp, cents) => onAddOnHand(ingredient.id, productId, qty, exp, cents)}
          newTrigger={newTrigger}
        />
      )}

      {editUnattributed > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="card-row">
            <span className="body" style={{ color: "var(--sage)", opacity: 0.7 }}>
              Unattributed
            </span>
            <StockAdjust
              ingredientId={ingredient.id}
              unit={ingredient.canonicalUnit}
              current={editUnattributed}
              tone="default"
              onAdjusted={(delta, e) => onApplyDelta(ingredient.id, null, delta, e)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Ingredient-level add-on-hand, styled as a blank lot row: blank image, a title
// that IS the product dropdown, and click-to-edit ×/exp/$. The lot is created the
// moment a product AND a positive qty are both set; exp/$ set beforehand ride along.
function AddOnHand({
  unit, products, onAdd, newTrigger,
}: {
  unit: string;
  products: Product[];
  onAdd: (productId: number, qty: number, exp: string | null, cents: number | null) => Promise<void>;
  newTrigger?: number;
}) {
  const [open, setOpen] = useState(false);
  // Opens the form the same way clicking "+ add on-hand" does, once per
  // increment of newTrigger (the desktop "n" shortcut) — not on mount.
  const prevTrigger = useRef(newTrigger);
  useEffect(() => {
    if (newTrigger !== undefined && newTrigger !== prevTrigger.current) {
      prevTrigger.current = newTrigger;
      setOpen(true);
    }
  }, [newTrigger]);
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
