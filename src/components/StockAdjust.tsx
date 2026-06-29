"use client";

import { useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
import { formatQty } from "@/lib/units";

type Tone = "default" | "low";

/**
 * The stock value cell. Tap the chip to edit the total directly; on save we
 * record the difference from the current amount as a movement and report it
 * back so the list updates without reload.
 */
export function StockAdjust({
  ingredientId,
  productId = null,
  unit,
  current,
  tone,
  onAdjusted,
}: {
  ingredientId: number;
  productId?: number | null;
  unit: string;
  current: number;
  tone: Tone;
  onAdjusted: (delta: number, expiresAt: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const target = Number(draft);
    if (!Number.isFinite(target) || busy) return;
    const delta = target - current;
    if (delta === 0 && !expiresAt) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredientId, productId, delta, expiresAt: expiresAt || null }),
    });
    setBusy(false);
    if (res.ok) {
      onAdjusted(delta, expiresAt || null);
      setOpen(false);
    } else {
      setError("Couldn't save.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-link"
        style={{ padding: 0 }}
        aria-label="Edit amount"
        onClick={() => {
          setDraft(String(current));
          setOpen(true);
        }}
      >
        <QuantityChip value={formatQty(current, unit)} tone={tone} />
      </button>
    );
  }

  return (
    <div className="servings-row" style={{ gap: 8 }}>
      <input
        type="number"
        inputMode="decimal"
        autoFocus
        className="input"
        style={{ width: 90 }}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <span className="meta">{unit}</span>
      <input
        type="date"
        className="input"
        aria-label="Expires · optional"
        value={expiresAt}
        disabled={busy}
        onChange={(e) => setExpiresAt(e.target.value)}
      />
      <button type="button" className="tab" onClick={save} disabled={busy}>
        save
      </button>
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
      >
        cancel
      </button>
      {error && <p className="notice">{error}</p>}
    </div>
  );
}
