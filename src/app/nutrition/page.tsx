"use client";

import { useEffect, useState } from "react";
import type { DayNutrition, IngredientNutritionRow, Nutrients } from "@/lib/nutrition";
import { NutritionFacts, FACT_ROWS } from "@/components/NutritionFacts";

function todayISO(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}

const round = (n: number) => Math.round(n);
const g = (n: number) => `${Math.round(n)}g`;

// Compact macro line for a single meal.
function macroLine(n: Nutrients): string {
  return `${round(n.calories)} kcal · P ${g(n.proteinG)} · C ${g(n.carbsG)} · F ${g(n.fatG)}`;
}

export default function NutritionPage() {
  const [tab, setTab] = useState<"day" | "ingredients">("day");
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
        <div className="filter">
          <button type="button" aria-pressed={tab === "day"} onClick={() => setTab("day")}>Day</button>
          <button type="button" aria-pressed={tab === "ingredients"} onClick={() => setTab("ingredients")}>Ingredients</button>
        </div>

        {tab === "ingredients" ? (
          <IngredientsTable />
        ) : (
        <>
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
          <section className="stack">
            <p className="section-label">Day total</p>
            <NutritionFacts values={total} servingLabel="Whole day" />
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
        </>
        )}
      </div>
    </>
  );
}

// Columns: Calories + the standard label rows (reused so labels/units match).
const COLS = [{ key: "calories" as const, label: "Cal", unit: "" }, ...FACT_ROWS];

function IngredientsTable() {
  const [rows, setRows] = useState<IngredientNutritionRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nutrition/ingredients", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setRows(d); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  if (!rows) return <p style={{ opacity: 0.6 }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ opacity: 0.6 }}>No ingredients have nutrition filled in yet.</p>;

  return (
    <>
      <p className="section-label">Per 100 units of each ingredient&apos;s preferred product.</p>
      <div style={{ overflowX: "auto" }}>
        <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>Nutrient</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Total</th>
              {rows.map((r) => (
                <th key={r.ingredientId} style={{ textAlign: "right", padding: "6px 8px" }}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "1px solid var(--line, #0001)" }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>Qty</th>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>—</td>
              {rows.map((r) => (
                <td key={r.ingredientId} style={{ textAlign: "right", padding: "6px 8px", opacity: 0.6 }}>100{r.unit}</td>
              ))}
            </tr>
            {COLS.map((c) => {
              const present = rows.map((r) => r.values[c.key]).filter((v): v is number => v != null);
              const total = present.length ? present.reduce((a, b) => a + b, 0) : null;
              return (
              <tr key={c.key} style={{ borderTop: "1px solid var(--line, #0001)" }}>
                <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>
                  {c.label}{c.unit ? ` (${c.unit})` : ""}
                </th>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>
                  {total != null ? Math.round(total) : "—"}
                </td>
                {rows.map((r) => (
                  <td key={r.ingredientId} style={{ textAlign: "right", padding: "6px 8px" }}>
                    {r.values[c.key] != null ? Math.round(r.values[c.key]!) : "—"}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
