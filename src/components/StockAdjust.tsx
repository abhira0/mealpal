"use client";

import { useState } from "react";
import { Stepper } from "@/components/Stepper";

/**
 * Inline "+ adjust" affordance for a pantry row. Reveals a custom stepper
 * (no native controls) whose value is the delta multiplier, and POSTs it to
 * /api/stock. For g/ml a single unit is multiplied by a sensible step. Reports
 * the applied delta back to the parent so the list can update without reload.
 */
export function StockAdjust({
  ingredientId,
  unit,
  onAdjusted,
}: {
  ingredientId: number;
  unit: string;
  onAdjusted: (delta: number) => void;
}) {
  const step = unit === "g" || unit === "ml" ? 50 : 1;
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(sign: 1 | -1) {
    const delta = sign * units * step;
    if (delta === 0 || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredientId, delta }),
    });
    setBusy(false);
    if (res.ok) {
      onAdjusted(delta);
      setUnits(1);
      setOpen(false);
    } else {
      setError("Couldn't save.");
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-link" onClick={() => setOpen(true)}>
        + adjust
      </button>
    );
  }

  return (
    <div className="stack-sm" style={{ marginTop: 10 }}>
      <div className="servings-row">
        <Stepper value={units} min={1} onChange={setUnits} />
        <span className="meta">
          ×{step} {unit}
        </span>
      </div>
      <div className="servings-row">
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="tab" onClick={() => commit(1)} disabled={busy}>
            + add
          </button>
          <button type="button" className="tab" onClick={() => commit(-1)} disabled={busy}>
            − use
          </button>
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setOpen(false);
            setError(null);
            setUnits(1);
          }}
        >
          cancel
        </button>
      </div>
      {error && <p className="notice">{error}</p>}
    </div>
  );
}
