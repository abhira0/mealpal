"use client";

import { useState } from "react";

// Nutrition is STORED per canonical unit, but a label is read PER SERVING. So
// this editor takes the serving size + the printed per-serving numbers and
// converts: perUnit = perServing / servingSize. Mount does the reverse.

const NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "fatG", label: "Total fat", unit: "g" },
  { key: "satFatG", label: "Saturated fat", unit: "g" },
  { key: "transFatG", label: "Trans fat", unit: "g" },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "carbsG", label: "Total carbs", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sugarG", label: "Sugar", unit: "g" },
  { key: "proteinG", label: "Protein", unit: "g" },
] as const;

type Key = (typeof NUTRIENTS)[number]["key"];
type PerUnit = Partial<Record<Key, number | null>> & { servingSize: number | null };

const str = (n: number | null | undefined) =>
  n == null ? "" : String(Math.round(n * 1000) / 1000);

export function NutritionFactsEditor({
  productId,
  initial,
  unit,
  onSaved,
}: {
  productId: number;
  initial: PerUnit;
  unit: string;
  onSaved?: () => void;
}) {
  const s0 = initial.servingSize ?? 1; // derive per-serving from stored per-unit
  const [serving, setServing] = useState(str(initial.servingSize));
  const [vals, setVals] = useState<Record<Key, string>>(() =>
    Object.fromEntries(
      NUTRIENTS.map((n) => [n.key, str(initial[n.key] != null ? initial[n.key]! * s0 : null)]),
    ) as Record<Key, string>,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const s = Number(serving);
    if (!serving || !Number.isFinite(s) || s <= 0) {
      setMsg("Enter a serving size greater than 0.");
      return;
    }
    setBusy(true);
    setMsg(null);
    // per-serving → per-unit; blank clears (null)
    const patch: Record<string, number | null> = { servingSize: s };
    for (const n of NUTRIENTS) {
      const raw = vals[n.key].trim();
      patch[n.key] = raw === "" ? null : Number(raw) / s;
    }
    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (res.ok) { setMsg("Saved."); onSaved?.(); }
    else setMsg((await res.json().catch(() => ({}))).error ?? "Save failed");
  }

  return (
    <div className="stack-sm">
      <label className="field">
        <span className="field-label">Serving size{unit ? ` (${unit})` : ""}</span>
        <input className="input" type="number" inputMode="decimal" value={serving}
          onChange={(e) => setServing(e.target.value)} placeholder={`per serving, in ${unit || "units"}`} />
      </label>
      {NUTRIENTS.map((n) => (
        <label className="field" key={n.key}>
          <span className="field-label">{n.label}{n.unit ? ` (${n.unit})` : ""} · per serving</span>
          <input className="input" type="number" inputMode="decimal" value={vals[n.key]}
            onChange={(e) => setVals((v) => ({ ...v, [n.key]: e.target.value }))} />
        </label>
      ))}
      <button type="button" className="btn block" disabled={busy} onClick={save}>
        {busy ? "…" : "Save nutrition facts"}
      </button>
      {msg && <p className="notice" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
