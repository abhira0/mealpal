// The standard US FDA "Nutrition Facts" label. Values are stored per canonical
// unit; we scale by serving size to show per-serving numbers, with %DV from the
// FDA reference daily values (2,000 kcal diet).

type Facts = {
  servingSize: number | null;
  calories: number | null;
  fatG: number | null;
  satFatG: number | null;
  transFatG: number | null;
  cholesterolMg: number | null;
  sodiumMg: number | null;
  carbsG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  proteinG: number | null;
};

// FDA daily reference values; null = no established %DV (trans fat, sugar, protein).
const DV = { fatG: 78, satFatG: 20, cholesterolMg: 300, sodiumMg: 2300, carbsG: 275, fiberG: 28 } as const;

const rule = (w: number) => ({ borderBottom: `${w}px solid #000` });
const round = (n: number) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));

function Line({ label, value, unit, dv, bold, indent }: {
  label: string; value: number | null; unit: string; dv?: number; bold?: boolean; indent?: boolean;
}) {
  if (value == null) return null;
  const pct = dv ? Math.round((value / dv) * 100) : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", ...rule(1) }}>
      <span style={{ paddingLeft: indent ? 16 : 0 }}>
        <strong style={{ fontWeight: bold ? 700 : 400 }}>{label}</strong> {round(value)}{unit}
      </span>
      {pct != null && <strong>{pct}%</strong>}
    </div>
  );
}

export function NutritionFacts({ facts, unit }: { facts: Facts; unit: string }) {
  // Scale per-unit values by the serving size; with none set, fall back to one
  // canonical unit so the numbers still show (and the header says so).
  const s = facts.servingSize ?? 1;
  const per = (v: number | null) => (v == null ? null : v * s);

  return (
    <div style={{ background: "#fff", color: "#000", border: "1px solid #000", borderRadius: 4, padding: 12, fontFamily: "Helvetica, Arial, sans-serif", maxWidth: 320 }}>
      <div style={{ fontSize: 28, fontWeight: 800, ...rule(1) }}>Nutrition Facts</div>
      <div style={{ padding: "2px 0", ...rule(8) }}>
        Serving size <strong>{round(s)}{unit}</strong>
        {facts.servingSize == null && <span style={{ fontWeight: 400 }}> (per {unit || "unit"})</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 2, ...rule(4) }}>
        <strong style={{ fontSize: 18 }}>Calories</strong>
        <strong style={{ fontSize: 32 }}>{per(facts.calories) != null ? round(per(facts.calories)!) : "—"}</strong>
      </div>

      <div style={{ textAlign: "right", fontSize: 12, padding: "2px 0", ...rule(1) }}>% Daily Value*</div>

      <Line label="Total Fat" value={per(facts.fatG)} unit="g" dv={DV.fatG} bold />
      <Line label="Saturated Fat" value={per(facts.satFatG)} unit="g" dv={DV.satFatG} indent />
      <Line label="Trans Fat" value={per(facts.transFatG)} unit="g" indent />
      <Line label="Cholesterol" value={per(facts.cholesterolMg)} unit="mg" dv={DV.cholesterolMg} bold />
      <Line label="Sodium" value={per(facts.sodiumMg)} unit="mg" dv={DV.sodiumMg} bold />
      <Line label="Total Carbohydrate" value={per(facts.carbsG)} unit="g" dv={DV.carbsG} bold />
      <Line label="Dietary Fiber" value={per(facts.fiberG)} unit="g" dv={DV.fiberG} indent />
      <Line label="Total Sugars" value={per(facts.sugarG)} unit="g" indent />
      <div style={rule(4)}>
        <Line label="Protein" value={per(facts.proteinG)} unit="g" bold />
      </div>

      <p style={{ fontSize: 10, margin: "8px 0 0", lineHeight: 1.3 }}>
        * The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
      </p>
    </div>
  );
}
