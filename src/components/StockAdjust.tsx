"use client";

import { useState } from "react";
import { Stepper } from "@/components/Stepper";

const linkStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--enamel)",
  background: "none",
  border: "none",
  padding: "8px 4px",
  minHeight: 36,
  cursor: "pointer",
};

const btnStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  background: "var(--paper-raised)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  color: "var(--enamel)",
  padding: "8px 10px",
  minHeight: 38,
  cursor: "pointer",
};

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
      <button type="button" style={linkStyle} onClick={() => setOpen(true)}>
        + adjust
      </button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <Stepper value={units} min={1} onChange={setUnits} />
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--sage)",
        }}
      >
        ×{step} {unit}
      </span>
      <button type="button" style={btnStyle} onClick={() => commit(1)} disabled={busy}>
        + add
      </button>
      <button type="button" style={btnStyle} onClick={() => commit(-1)} disabled={busy}>
        − use
      </button>
      <button
        type="button"
        style={linkStyle}
        onClick={() => {
          setOpen(false);
          setError(null);
          setUnits(1);
        }}
      >
        cancel
      </button>
      {error && (
        <span className="eb" style={{ color: "var(--paprika)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
