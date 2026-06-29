// The standard US FDA "Nutrition Facts" label, read-only. Callers pass values
// already scaled to ONE serving; %DV uses the FDA reference daily values.

export const FACT_ROWS = [
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

export type FactKey = (typeof FACT_ROWS)[number]["key"] | "calories";
export type FactValues = Partial<Record<FactKey, number | null>>;

const rule = (w: number) => ({ borderBottom: `${w}px solid #000` });
const round = (n: number) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));

function Line({ row, value }: { row: (typeof FACT_ROWS)[number]; value: number | null }) {
  if (value == null) return null;
  const dv = "dv" in row ? row.dv : undefined;
  const pct = dv ? Math.round((value / dv) * 100) : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", ...rule(1) }}>
      <span style={{ paddingLeft: "indent" in row && row.indent ? 16 : 0 }}>
        <strong style={{ fontWeight: "bold" in row && row.bold ? 700 : 400 }}>{row.label}</strong> {round(value)}{row.unit}
      </span>
      {pct != null && <strong>{pct}%</strong>}
    </div>
  );
}

export function NutritionFacts({ values, servingLabel }: { values: FactValues; servingLabel: string }) {
  const lastVisibleIdx = FACT_ROWS.map((r) => values[r.key] != null).lastIndexOf(true);

  return (
    <div style={{ background: "#fff", color: "#000", border: "1px solid #000", borderRadius: 4, padding: 12, fontFamily: "Helvetica, Arial, sans-serif", maxWidth: 320, margin: "0 auto" }}>
      <div style={{ fontSize: 28, fontWeight: 800, ...rule(1) }}>Nutrition Facts</div>
      <div style={{ padding: "2px 0", ...rule(8) }}>
        Serving size <strong>{servingLabel}</strong>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 2, ...rule(4) }}>
        <strong style={{ fontSize: 18 }}>Calories</strong>
        <strong style={{ fontSize: 32 }}>{values.calories != null ? round(values.calories) : "—"}</strong>
      </div>

      <div style={{ textAlign: "right", fontSize: 12, padding: "2px 0", ...rule(1) }}>% Daily Value*</div>

      {FACT_ROWS.map((row, i) => (
        <div key={row.key} style={i === lastVisibleIdx ? rule(4) : undefined}>
          <Line row={row} value={values[row.key] ?? null} />
        </div>
      ))}

      <p style={{ fontSize: 10, margin: "8px 0 0", lineHeight: 1.3 }}>
        * The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
      </p>
    </div>
  );
}
