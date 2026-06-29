"use client";

import { useEffect, useState } from "react";
import type { DayNutrition, IngredientNutritionRow, Nutrients, Goals, Scorecard } from "@/lib/nutrition";
import { NutritionFacts, FACT_ROWS } from "@/components/NutritionFacts";
import { EChart } from "@/components/EChart";

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
  const [tab, setTab] = useState<"day" | "ingredients" | "analysis">("day");
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
        <div className="tabs">
          <button type="button" aria-pressed={tab === "day"} onClick={() => setTab("day")}>Day</button>
          <button type="button" aria-pressed={tab === "ingredients"} onClick={() => setTab("ingredients")}>Ingredients</button>
          <button type="button" aria-pressed={tab === "analysis"} onClick={() => setTab("analysis")}>Analysis</button>
        </div>

        {tab !== "analysis" && (
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
        )}

        {tab === "analysis" ? (
          <AnalysisTab date={date} setDate={setDate} />
        ) : tab === "ingredients" ? (
          <IngredientsTable date={date} />
        ) : (
        <>
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

function IngredientsTable({ date }: { date: string }) {
  const [loaded, setLoaded] = useState<{ date: string; rows: IngredientNutritionRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nutrition/ingredients?date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setLoaded({ date, rows: d }); })
      .catch(() => { if (!cancelled) setLoaded({ date, rows: [] }); });
    return () => { cancelled = true; };
  }, [date]);

  if (loaded?.date !== date) return <p style={{ opacity: 0.6 }}>Loading…</p>;
  const rows = loaded.rows;
  if (rows.length === 0) return <p style={{ opacity: 0.6 }}>No ingredients used on this day.</p>;

  return (
    <>
      <p className="section-label">Actual quantity used per ingredient on this day.</p>
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
                <td key={r.ingredientId} style={{ textAlign: "right", padding: "6px 8px", opacity: 0.6 }}>{Math.round(r.qty)}{r.unit}</td>
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

// ---------- Analysis tab ----------

interface MealLine { slotName: string; recipeName: string; estimate: boolean; calories: number; }

interface AnalysisData {
  mode: "day" | "week";
  goals: Goals;
  nutrients: Nutrients;
  macros: { carbs: number; fat: number; protein: number };
  scorecards: Scorecard[];
  missing: string[];
  meals?: MealLine[];
  monday?: string;
  daysWithMeals?: number;
  perDay?: { date: string; total: Nutrients; hasMeals: boolean }[];
  _key?: string; // request this data was fetched for, to derive loading
}

const MACRO_COLOR = { protein: "#115E59", carbs: "#E0A526", fat: "#D1492C" };

function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const z = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function AnalysisTab({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [data, setData] = useState<AnalysisData | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reqKey = `${mode}:${date}:${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nutrition/analysis?mode=${mode}&date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d ? { ...d, _key: reqKey } : null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [mode, date, reqKey]);

  const loading = data?._key !== reqKey;

  return (
    <div className="stack">
      <div className="filter">
        <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
        <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
      </div>

      {mode === "day" ? (
        <label className="field" htmlFor="analysis-date">
          <span className="field-label">Date</span>
          <input id="analysis-date" className="input" type="date" value={date}
            onChange={(e) => setDate(e.target.value || todayISO())} />
        </label>
      ) : (
        <div className="filter" style={{ justifyContent: "space-between" }}>
          <button type="button" onClick={() => setDate(isoAddDays(date, -7))}>‹ Prev</button>
          <span className="mono" style={{ fontSize: 12 }}>
            {data?.monday ? `${shortDate(data.monday)} – ${shortDate(isoAddDays(data.monday, 6))}` : "…"}
          </span>
          <button type="button" onClick={() => setDate(isoAddDays(date, 7))}>Next ›</button>
        </div>
      )}

      {loading || !data ? (
        <p style={{ opacity: 0.6 }}>Loading…</p>
      ) : mode === "week" && data.daysWithMeals === 0 ? (
        <p style={{ opacity: 0.6 }}>No meals planned this week.</p>
      ) : (
        <AnalysisBody data={data} mode={mode} openCard={openCard} setOpenCard={setOpenCard} />
      )}

      <GoalsEditor goals={data?.goals} editing={editing} setEditing={setEditing}
        reload={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

function AnalysisBody({ data, mode, openCard, setOpenCard }: {
  data: AnalysisData; mode: "day" | "week";
  openCard: string | null; setOpenCard: (k: string | null) => void;
}) {
  const n = data.nutrients;
  const goals = data.goals;
  const cal = Math.round(n.calories);
  const pct = goals.calorieGoal > 0 ? Math.round((cal / goals.calorieGoal) * 100) : 0;

  const ringOption = {
    series: [{
      type: "gauge", startAngle: 90, endAngle: -270, radius: "100%",
      min: 0, max: goals.calorieGoal || 1,
      progress: { show: true, width: 16, roundCap: true, itemStyle: { color: MACRO_COLOR.protein } },
      axisLine: { lineStyle: { width: 16, color: [[1, "#e3ddcc"]] } },
      pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      anchor: { show: false },
      detail: {
        valueAnimation: true, offsetCenter: [0, "-8%"], fontSize: 26, fontWeight: 800,
        color: "#20262B", formatter: (v: number) => String(Math.round(v)),
      },
      title: { show: false },
      data: [{ value: cal }],
    }],
  } as const;

  return (
    <>
      <EChart option={ringOption as never} height={180} />
      <p className="mono" style={{ textAlign: "center", margin: "-8px 0 0", fontSize: 12, color: "var(--sage)" }}>
        of {goals.calorieGoal} kcal · {pct}%{mode === "week" ? " · daily avg" : ""}
      </p>

      <p className="section-label">Macro distribution{mode === "week" ? " (daily avg)" : ""}</p>
      <MacroDonut macros={data.macros} />

      <p className="section-label">Macros vs goal</p>
      <MacroBar label="Protein" value={n.proteinG} goal={goals.proteinG} color={MACRO_COLOR.protein} />
      <MacroBar label="Carbs" value={n.carbsG} goal={goals.carbsG} color={MACRO_COLOR.carbs} />
      <MacroBar label="Fat" value={n.fatG} goal={goals.fatG} color={MACRO_COLOR.fat} />

      {mode === "day" && data.meals && data.meals.length > 0 && <CaloriesByMeal meals={data.meals} />}

      {mode === "week" && data.perDay && <WeekTrend perDay={data.perDay} />}

      <p className="section-label">Nutrients{mode === "week" ? " (daily avg)" : ""} vs goal</p>
      <NutrientTable n={n} goals={goals} />

      <p className="section-label">Diet scorecards</p>
      <div className="filter" style={{ gap: 6 }}>
        {data.scorecards.map((c) => (
          <button key={c.key} type="button"
            onClick={() => setOpenCard(openCard === c.key ? null : c.key)}
            style={{
              borderRadius: 999, fontWeight: 700,
              background: c.pass ? "#E3EDE4" : "#F4D9CE",
              borderColor: c.pass ? "#c3d6c4" : "#e3b9a6",
              color: c.pass ? "var(--enamel-dark)" : "#9c3a1f",
            }}>
            {c.label} {c.pass ? "✓" : "✗"}
          </button>
        ))}
      </div>
      {openCard && (
        <p className="mono" style={{ fontSize: 11, color: "var(--sage)", margin: 0 }}>
          {data.scorecards.find((c) => c.key === openCard)?.reason}
        </p>
      )}

      {data.missing.length > 0 && (
        <p className="notice" style={{ margin: 0 }}>
          Missing nutrition for: {data.missing.join(", ")}. Totals undercount until their products are filled in.
        </p>
      )}
    </>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const w = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <b>{label}</b>
        <span className="mono" style={{ fontSize: 11, color: "var(--sage)" }}>{Math.round(value)} / {goal} g</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "#e3ddcc", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

const nfmt = (x: number) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x));

function MacroDonut({ macros }: { macros: AnalysisData["macros"] }) {
  if (macros.carbs + macros.fat + macros.protein === 0)
    return <p style={{ opacity: 0.6, textAlign: "center", margin: 0 }}>No calories logged.</p>;
  const option = {
    tooltip: { trigger: "item", formatter: "{b}: {c}% of calories" },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    series: [{
      type: "pie", radius: ["45%", "70%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      label: { show: true, formatter: "{b}\n{d}%", fontSize: 10 },
      data: [
        { value: Math.round(macros.carbs), name: "Carbs", itemStyle: { color: MACRO_COLOR.carbs } },
        { value: Math.round(macros.fat), name: "Fat", itemStyle: { color: MACRO_COLOR.fat } },
        { value: Math.round(macros.protein), name: "Protein", itemStyle: { color: MACRO_COLOR.protein } },
      ],
    }],
  };
  return <EChart option={option as never} height={220} />;
}

function CaloriesByMeal({ meals }: { meals: MealLine[] }) {
  const max = Math.max(...meals.map((m) => m.calories), 1);
  return (
    <>
      <p className="section-label">Calories by meal</p>
      {meals.map((m, i) => (
        <div key={i} style={{ margin: "6px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>{m.estimate ? "≈ " : ""}<b>{m.slotName}</b> <span style={{ opacity: 0.6 }}>{m.recipeName}</span></span>
            <span className="mono" style={{ fontSize: 11, color: "var(--sage)" }}>{round(m.calories)} kcal</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "#e3ddcc", overflow: "hidden", marginTop: 2 }}>
            <div style={{ height: "100%", width: `${(m.calories / max) * 100}%`, background: MACRO_COLOR.protein }} />
          </div>
        </div>
      ))}
    </>
  );
}

// Full nutrient list (calories + the FDA label rows), each vs its goal:
// user goals for calories/protein/carbs/fat, FDA Daily Values for the rest.
function NutrientTable({ n, goals }: { n: Nutrients; goals: Goals }) {
  const goalFor = (key: string): number | null => {
    if (key === "proteinG") return goals.proteinG;
    if (key === "carbsG") return goals.carbsG;
    if (key === "fatG") return goals.fatG;
    const row = FACT_ROWS.find((r) => r.key === key);
    return row && "dv" in row ? row.dv : null;
  };
  const rows: { label: string; value: number; unit: string; goal: number | null; bold?: boolean; indent?: boolean }[] = [
    { label: "Calories", value: n.calories, unit: "", goal: goals.calorieGoal, bold: true },
    ...FACT_ROWS.map((r) => ({
      label: r.label, value: n[r.key], unit: r.unit, goal: goalFor(r.key),
      bold: "bold" in r ? r.bold : false, indent: "indent" in r ? r.indent : false,
    })),
  ];
  return (
    <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ color: "var(--sage)", textAlign: "right" }}>
          <th style={{ textAlign: "left", padding: "4px 8px 4px 0", fontWeight: 600 }}>Nutrient</th>
          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Total</th>
          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Goal</th>
          <th style={{ padding: "4px 0", fontWeight: 600 }}>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const pct = r.goal && r.goal > 0 ? Math.round((r.value / r.goal) * 100) : null;
          const over = pct != null && pct > 100;
          return (
            <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: r.bold ? 700 : 400, paddingLeft: r.indent ? 14 : 0, padding: "4px 8px 4px 0" }}>{r.label}</th>
              <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: r.bold ? 700 : 400 }}>{nfmt(r.value)}{r.unit}</td>
              <td style={{ textAlign: "right", padding: "4px 8px", color: "var(--sage)" }}>{r.goal != null ? `${r.goal}${r.unit}` : "—"}</td>
              <td style={{ textAlign: "right", padding: "4px 0", fontWeight: 600, color: over ? "#9c3a1f" : "var(--ink)" }}>{pct != null ? `${pct}%` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WeekTrend({ perDay }: { perDay: NonNullable<AnalysisData["perDay"]> }) {
  const days = perDay.map((d) => shortDate(d.date));
  // % of each day's calories from a macro (100%-stacked, like MyFitnessPal's week view).
  const pct = (d: { total: Nutrients }, key: keyof Nutrients, factor: number) => {
    const cal = 4 * d.total.carbsG + 9 * d.total.fatG + 4 * d.total.proteinG;
    return cal > 0 ? Math.round((factor * d.total[key] / cal) * 100) : 0;
  };
  const series = (key: keyof Nutrients, factor: number, name: string, color: string) => ({
    name, type: "bar", stack: "pct", itemStyle: { color },
    data: perDay.map((d) => pct(d, key, factor)),
  });
  const option = {
    grid: { left: 32, right: 8, top: 28, bottom: 20 },
    legend: { top: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10 } },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v}%` },
    xAxis: { type: "category", data: days, axisLabel: { fontSize: 9 } },
    yAxis: { type: "value", max: 100, axisLabel: { fontSize: 9, formatter: "{value}%" } },
    series: [
      series("carbsG", 4, "Carbs", MACRO_COLOR.carbs),
      series("proteinG", 4, "Protein", MACRO_COLOR.protein),
      series("fatG", 9, "Fat", MACRO_COLOR.fat),
    ],
  };
  return (
    <>
      <p className="section-label">Calories from each macro, by day</p>
      <EChart option={option as never} height={200} />
    </>
  );
}

function GoalsEditor({ goals, editing, setEditing, reload }: {
  goals: Goals | undefined; editing: boolean; setEditing: (b: boolean) => void;
  reload: () => void;
}) {
  const [form, setForm] = useState<Goals | null>(null);

  if (!editing || !form) {
    return (
      <button type="button" className="btn-link" style={{ alignSelf: "flex-start" }}
        disabled={!goals}
        onClick={() => { if (goals) { setForm(goals); setEditing(true); } }}>Edit goals</button>
    );
  }

  const field = (key: keyof Goals, label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={0} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
    </label>
  );

  const save = async () => {
    await fetch("/api/nutrition/goals", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setEditing(false);
    reload();
  };

  return (
    <section className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <p className="section-label">Daily goals</p>
      {field("calorieGoal", "Calories")}
      {field("proteinG", "Protein (g)")}
      {field("carbsG", "Carbs (g)")}
      {field("fatG", "Fat (g)")}
      <div className="filter">
        <button type="button" onClick={save}>Save</button>
        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </section>
  );
}
