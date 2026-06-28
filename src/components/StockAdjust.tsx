"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Inline +/- adjust that POSTs a delta to /api/stock. */
export function StockAdjust({
  ingredientId,
  unit,
}: {
  ingredientId: number;
  unit: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) return;
    setBusy(true);
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredientId, delta: n }),
    });
    setBusy(false);
    if (res.ok) {
      setDelta("");
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        + adjust
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="row" style={{ flexWrap: "wrap" }}>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        placeholder={`± ${unit}`}
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        aria-label={`Adjust stock in ${unit}`}
        style={{ width: 110 }}
        autoFocus
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "…" : "Save"}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
