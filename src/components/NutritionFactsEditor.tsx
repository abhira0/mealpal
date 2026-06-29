"use client";

import { useState } from "react";

// The FDA Nutrition Facts label, but every number is an input. Values are
// entered PER SERVING (as printed on a label) and stored PER CANONICAL UNIT:
// perUnit = perServing / servingSize. Mount reverses it for display.

const NUTRIENTS = [
  { key: "fatG", label: "Total Fat", unit: "g", dv: 78, bold: true },
  { key: "satFatG", label: "Saturated Fat", unit: "g", dv: 20, indent: true },
  { key: "transFatG", label: "Trans Fat", unit: "g", indent: true },
  { key: "polyFatG", label: "Polyunsaturated Fat", unit: "g", indent: true },
  { key: "monoFatG", label: "Monounsaturated Fat", unit: "g", indent: true },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", dv: 300, bold: true },
  { key: "sodiumMg", label: "Sodium", unit: "mg", dv: 2300, bold: true },
  { key: "carbsG", label: "Total Carbohydrate", unit: "g", dv: 275, bold: true },
  { key: "fiberG", label: "Dietary Fiber", unit: "g", dv: 28, indent: true },
  { key: "sugarG", label: "Total Sugars", unit: "g", indent: true },
  { key: "addedSugarG", label: "Includes Added Sugars", unit: "g", dv: 50, indent: true },
  { key: "proteinG", label: "Protein", unit: "g", bold: true },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "mcg", dv: 20 },
  { key: "calciumMg", label: "Calcium", unit: "mg", dv: 1300 },
  { key: "ironMg", label: "Iron", unit: "mg", dv: 18 },
  { key: "potassiumMg", label: "Potassium", unit: "mg", dv: 4700 },
  { key: "vitaminAMcg", label: "Vitamin A", unit: "mcg", dv: 900 },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", dv: 90 },
] as const;

type Key = (typeof NUTRIENTS)[number]["key"] | "calories";
export type PerUnit = Partial<Record<Key, number | null>> & { servingSize: number | null };

// Every editable nutrient key (per serving). Callers build `initial` from this
// so no field can be silently dropped from the prefill.
export const EDITOR_KEYS = ["calories", ...NUTRIENTS.map((n) => n.key)] as Key[];

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const str = (n: number | null | undefined) => (n == null ? "" : String(round3(n)));
const rule = (w: number) => ({ borderBottom: `${w}px solid #000` });

const inputStyle: React.CSSProperties = {
  font: "inherit", width: 64, textAlign: "right", border: "none",
  borderBottom: "1px solid #999", background: "transparent", color: "#000", padding: "0 2px",
};

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
      EDITOR_KEYS.map((k) => [k, str(initial[k] != null ? initial[k]! * s0 : null)]),
    ) as Record<Key, string>,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const setVal = (k: Key, v: string) => setVals((p) => ({ ...p, [k]: v }));
  // Blank the inputs only; nothing is removed until Save writes the nulls.
  const clear = () => {
    setServing("");
    setVals(Object.fromEntries(EDITOR_KEYS.map((k) => [k, ""])) as Record<Key, string>);
    setMsg(null);
  };
  const dv = (k: Key, dvBase?: number) => {
    if (!dvBase) return null;
    const v = Number(vals[k]);
    return vals[k].trim() === "" || !Number.isFinite(v) ? null : Math.round((v / dvBase) * 100);
  };

  async function save() {
    const empty = serving.trim() === "" && EDITOR_KEYS.every((k) => vals[k].trim() === "");
    const s = Number(serving);
    // Allow saving an all-blank label (clears everything); otherwise require a serving.
    if (!empty && (!serving || !Number.isFinite(s) || s <= 0)) {
      setMsg("Enter a serving size greater than 0.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const patch: Record<string, number | null> = { servingSize: empty ? null : s };
    for (const k of EDITOR_KEYS) {
      const raw = vals[k].trim();
      patch[k] = raw === "" ? null : Number(raw) / s; // per-serving → per-unit
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

  const numInput = (k: Key) => (
    <input style={inputStyle} type="number" inputMode="decimal" step="any"
      value={vals[k]} onChange={(e) => setVal(k, e.target.value)} aria-label={k} />
  );

  return (
    <div style={{ background: "#fff", color: "#000", border: "1px solid #000", borderRadius: 4, padding: 12, fontFamily: "Helvetica, Arial, sans-serif", maxWidth: 340 }}>
      <div style={{ fontSize: 28, fontWeight: 800, ...rule(1) }}>Nutrition Facts</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", ...rule(8) }}>
        <span>Serving size</span>
        <input style={{ ...inputStyle, width: 56 }} type="number" inputMode="decimal" step="any"
          value={serving} onChange={(e) => setServing(e.target.value)} aria-label="serving size" />
        <strong>{unit}</strong>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2, ...rule(4) }}>
        <strong style={{ fontSize: 18 }}>Calories</strong>
        {numInput("calories")}
      </div>

      <div style={{ textAlign: "right", fontSize: 12, padding: "2px 0", ...rule(1) }}>% Daily Value*</div>

      {NUTRIENTS.map((n) => {
        const pct = dv(n.key, "dv" in n ? n.dv : undefined);
        const last = n.key === "proteinG";
        return (
          <div key={n.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", ...rule(last ? 4 : 1) }}>
            <span style={{ paddingLeft: "indent" in n && n.indent ? 16 : 0 }}>
              <strong style={{ fontWeight: "bold" in n && n.bold ? 700 : 400 }}>{n.label}</strong>{" "}
              {numInput(n.key)}{n.unit}
            </span>
            <strong>{pct != null ? `${pct}%` : ""}</strong>
          </div>
        );
      })}

      <p style={{ fontSize: 10, margin: "8px 0", lineHeight: 1.3 }}>
        Enter the values printed on the label (per serving). % Daily Value uses a 2,000 calorie diet.
      </p>

      <button type="button" className="btn block" disabled={busy} onClick={save}>
        {busy ? "…" : "Save nutrition facts"}
      </button>
      <button type="button" className="btn-link danger" style={{ width: "auto" }} disabled={busy} onClick={clear}>
        Clear
      </button>
      {msg && <p className="notice" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}
