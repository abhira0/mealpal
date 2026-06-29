"use client";

import { useEffect, useState } from "react";
import type { DayNutrition, Nutrients } from "@/lib/nutrition";

function todayISO(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}

const round = (n: number) => Math.round(n);
const g = (n: number) => `${Math.round(n)}g`;
const mg = (n: number) => `${Math.round(n)}mg`;

// Compact macro line for a single meal.
function macroLine(n: Nutrients): string {
  return `${round(n.calories)} kcal · P ${g(n.proteinG)} · C ${g(n.carbsG)} · F ${g(n.fatG)}`;
}

const TOTAL_ROWS: { label: string; key: keyof Nutrients; fmt: (n: number) => string }[] = [
  { label: "Protein", key: "proteinG", fmt: g },
  { label: "Carbs", key: "carbsG", fmt: g },
  { label: "— Sugar", key: "sugarG", fmt: g },
  { label: "— Fiber", key: "fiberG", fmt: g },
  { label: "Fat", key: "fatG", fmt: g },
  { label: "— Saturated", key: "satFatG", fmt: g },
  { label: "— Trans", key: "transFatG", fmt: g },
  { label: "Cholesterol", key: "cholesterolMg", fmt: mg },
  { label: "Sodium", key: "sodiumMg", fmt: mg },
];

export default function NutritionPage() {
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<DayNutrition | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nutrition?date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [date]);

  // loading = we don't yet have data for the requested date (no setState-in-effect)
  const loading = data?.date !== date;
  const total = loading ? null : data?.total;

  return (
    <>
      <header className="chrome">
        <p className="eb">Nutrition</p>
        <h1>What you ate</h1>
      </header>

      <div className="content stack">
        <label className="field" htmlFor="nutrition-date">
          <span className="field-label">Date</span>
          <input
            id="nutrition-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayISO())}
          />
        </label>

        {total && (
          <section className="card stack">
            <p className="section-label">Day total</p>
            <p style={{ margin: 0, fontSize: 32, fontWeight: 700 }} className="mono">
              {round(total.calories)} <span style={{ fontSize: 16, fontWeight: 500 }}>kcal</span>
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {TOTAL_ROWS.map((row, i) => (
                <li key={row.key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: i ? "1px solid var(--line, #0001)" : "none" }}>
                  <span>{row.label}</span>
                  <span className="mono">{row.fmt(total[row.key])}</span>
                </li>
              ))}
            </ul>
            {data!.missing.length > 0 && (
              <p className="notice" style={{ margin: 0 }}>
                Missing nutrition for: {data!.missing.join(", ")}. Totals undercount until their products are filled in.
              </p>
            )}
          </section>
        )}

        <p className="section-label">Meals</p>
        {loading ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : !data || data.meals.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No meals planned for this day.</p>
        ) : (
          data.meals.map((m) => (
            <div className="card" key={m.eventId}>
              <div className="card-row">
                <span className="title row-main">
                  {m.estimate ? "≈ " : ""}{m.recipeName}
                </span>
                <span className="slot">{m.slotName}</span>
              </div>
              <p className="mono" style={{ margin: "8px 0 0" }}>{macroLine(m.nutrients)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.6 }}>
                {m.servings} srv{m.estimate ? " · estimated from plan" : " · cooked"}
                {m.missing.length > 0 ? ` · missing: ${m.missing.join(", ")}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </>
  );
}
