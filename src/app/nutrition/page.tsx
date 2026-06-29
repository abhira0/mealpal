"use client";

import { useEffect, useState } from "react";
import type { IngredientNutritionRow, Nutrients, Goals, Scorecard } from "@/lib/nutrition";
import { FACT_ROWS } from "@/components/NutritionFacts";
import { EChart } from "@/components/EChart";
import { QuickEat } from "@/components/QuickEat";

function todayISO(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}

export default function NutritionPage() {
  const [tab, setTab] = useState<"overview" | "breakdown">("overview");
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
  const noMeals = !loading && data && mode === "week" && data.daysWithMeals === 0;

  return (
    <>
      <header className="chrome">
        <p className="eb">Nutrition</p>
        <h1>What you ate</h1>
      </header>

      <div className="content stack">
        <div className="tabs">
          <button type="button" aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" aria-pressed={tab === "breakdown"} onClick={() => setTab("breakdown")}>Breakdown</button>
        </div>

        <div className="filter">
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
        </div>

        {mode === "day" ? (
          <label className="field" htmlFor="nutrition-date">
            <span className="field-label">Date</span>
            <input id="nutrition-date" className="input" type="date" value={date}
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

        {mode === "day" && <QuickEat date={date} onLogged={() => setReloadKey((k) => k + 1)} />}

        {loading || !data ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : noMeals ? (
          <p style={{ opacity: 0.6 }}>No meals planned this week.</p>
        ) : tab === "overview" ? (
          <OverviewBody data={data} mode={mode} openCard={openCard} setOpenCard={setOpenCard}
            editing={editing} setEditing={setEditing} reload={() => setReloadKey((k) => k + 1)} />
        ) : (
          <BreakdownBody data={data} mode={mode} date={date} />
        )}
      </div>
    </>
  );
}

// Columns: Calories + the standard label rows (reused so labels/units match).
const COLS = [{ key: "calories" as const, label: "Cal", unit: "" }, ...FACT_ROWS];

function IngredientsTable({ date, mode }: { date: string; mode: "day" | "week" }) {
  const key = `${mode}:${date}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: IngredientNutritionRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nutrition/ingredients?mode=${mode}&date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setLoaded({ key, rows: d }); })
      .catch(() => { if (!cancelled) setLoaded({ key, rows: [] }); });
    return () => { cancelled = true; };
  }, [key, mode, date]);

  if (loaded?.key !== key) return <p style={{ opacity: 0.6 }}>Loading…</p>;
  const rows = loaded.rows;
  if (rows.length === 0) return <p style={{ opacity: 0.6 }}>No ingredients used this {mode === "week" ? "week" : "day"}.</p>;

  return (
    <>
      <p className="section-label">Actual quantity used per ingredient this {mode === "week" ? "week" : "day"}.</p>
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

interface MealLine { slotName: string; recipeName: string; estimate: boolean; calories: number; nutrients: Nutrients; }

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

function MissingNotice({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <p className="notice" style={{ margin: 0 }}>
      Missing nutrition for: {missing.join(", ")}. Totals undercount until their products are filled in.
    </p>
  );
}

// Overview lens: the dashboard — calorie ring, macro split, macros vs goal,
// scorecards, and the goals editor.
function OverviewBody({ data, mode, openCard, setOpenCard, editing, setEditing, reload }: {
  data: AnalysisData; mode: "day" | "week";
  openCard: string | null; setOpenCard: (k: string | null) => void;
  editing: boolean; setEditing: (b: boolean) => void; reload: () => void;
}) {
  const n = data.nutrients;
  const goals = data.goals;
  const cal = Math.round(n.calories);
  const pct = goals.calorieGoal > 0 ? Math.round((cal / goals.calorieGoal) * 100) : 0;

  return (
    <>
      <p className="section-label">Calories &amp; macros{mode === "week" ? " (daily avg)" : ""}</p>
      <CalorieMacroRing cal={cal} macros={data.macros} goal={goals.calorieGoal} n={n} />
      <p className="mono" style={{ textAlign: "center", margin: "-8px 0 0", fontSize: 12, color: "var(--sage)" }}>
        of {goals.calorieGoal} kcal · {pct}%{mode === "week" ? " · daily avg" : ""}
      </p>

      <p className="section-label">Macros vs goal</p>
      <MacroBar label="Protein" value={n.proteinG} goal={goals.proteinG} color={MACRO_COLOR.protein} />
      <MacroBar label="Carbs" value={n.carbsG} goal={goals.carbsG} color={MACRO_COLOR.carbs} />
      <MacroBar label="Fat" value={n.fatG} goal={goals.fatG} color={MACRO_COLOR.fat} />

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

      <MissingNotice missing={data.missing} />

      <GoalsEditor goals={data.goals} editing={editing} setEditing={setEditing} reload={reload} />
    </>
  );
}

// Breakdown lens: nutrient table (Total/Goal/%) with the contribution columns
// toggled between by-slot and by-ingredient; plus the week macro-trend chart.
function BreakdownBody({ data, mode, date }: { data: AnalysisData; mode: "day" | "week"; date: string }) {
  const [view, setView] = useState<"meals" | "ingredients">("meals");
  const dayMeals = mode === "day" && data.meals && data.meals.length > 0 ? data.meals : null;
  return (
    <>
      {mode === "week" && data.perDay && <WeekTrend perDay={data.perDay} />}
      <div className="filter">
        <button type="button" aria-pressed={view === "meals"} onClick={() => setView("meals")}>Meals</button>
        <button type="button" aria-pressed={view === "ingredients"} onClick={() => setView("ingredients")}>Ingredients</button>
      </div>
      {view === "meals" ? (
        <>
          <p className="section-label">
            Nutrients{dayMeals ? " — total, goal & by slot" : mode === "week" ? " (daily avg) vs goal" : " vs goal"}
          </p>
          {dayMeals
            ? <SlotNutrientTable n={data.nutrients} goals={data.goals} meals={dayMeals} />
            : <NutrientTable n={data.nutrients} goals={data.goals} />}
        </>
      ) : (
        <IngredientsTable date={date} mode={mode} />
      )}
      <MissingNotice missing={data.missing} />
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

// Combined view: inner donut = macro split, outer thin arc = calorie progress
// toward goal, calorie total in the center. One chart instead of two.
function CalorieMacroRing({ cal, macros, goal, n }: { cal: number; macros: AnalysisData["macros"]; goal: number; n: Nutrients }) {
  if (macros.carbs + macros.fat + macros.protein === 0)
    return <p style={{ opacity: 0.6, textAlign: "center", margin: 0 }}>No calories logged.</p>;
  const r = (x: number) => Math.round(x);
  // params.data carries our custom `grams`; gauge series shows calories vs goal.
  const tip = (p: { seriesType: string; name: string; value: number; data?: { grams?: number } }) =>
    p.seriesType === "gauge"
      ? `Calories: ${Math.round(p.value)} / ${goal} kcal · ${pctOf(p.value, goal) ?? 0}%`
      : `${p.name}: ${p.value}% of calories · ${p.data?.grams ?? 0} g`;
  const option = {
    tooltip: { trigger: "item", formatter: tip },
    legend: {
      bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 },
      data: ["Carbs", "Fat", "Protein"],
    },
    series: [
      {
        name: "Macros", type: "pie", radius: ["42%", "62%"], center: ["50%", "46%"],
        avoidLabelOverlap: false, label: { show: false }, labelLine: { show: false },
        emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" } },
        data: [
          { value: r(macros.carbs), name: "Carbs", grams: r(n.carbsG), itemStyle: { color: MACRO_COLOR.carbs } },
          { value: r(macros.fat), name: "Fat", grams: r(n.fatG), itemStyle: { color: MACRO_COLOR.fat } },
          { value: r(macros.protein), name: "Protein", grams: r(n.proteinG), itemStyle: { color: MACRO_COLOR.protein } },
        ],
      },
      {
        type: "gauge", radius: "92%", center: ["50%", "46%"], startAngle: 90, endAngle: -270,
        min: 0, max: goal || 1, silent: false,
        progress: { show: true, width: 7, roundCap: true, itemStyle: { color: MACRO_COLOR.protein } },
        axisLine: { lineStyle: { width: 7, color: [[1, "#e3ddcc"]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          offsetCenter: [0, "-4%"], fontSize: 24, fontWeight: 800, color: "#20262B",
          formatter: (v: number) => String(Math.round(v)),
        },
        title: { show: false },
        data: [{ value: cal }],
      },
    ],
  };
  return <EChart option={option as never} height={240} />;
}

// Shared rows for the nutrient tables: calories + the FDA label rows.
const LABEL_ROWS: { key: keyof Nutrients; label: string; unit: string; bold: boolean; indent: boolean }[] = [
  { key: "calories", label: "Calories", unit: "", bold: true, indent: false },
  ...FACT_ROWS.map((r) => ({
    key: r.key as keyof Nutrients, label: r.label, unit: r.unit,
    bold: "bold" in r ? !!r.bold : false, indent: "indent" in r ? !!r.indent : false,
  })),
];

// Goal per nutrient: user goals for calories/protein/carbs/fat, FDA Daily Values otherwise.
function goalFor(key: keyof Nutrients, goals: Goals): number | null {
  if (key === "calories") return goals.calorieGoal;
  if (key === "proteinG") return goals.proteinG;
  if (key === "carbsG") return goals.carbsG;
  if (key === "fatG") return goals.fatG;
  const row = FACT_ROWS.find((r) => r.key === key);
  return row && "dv" in row ? row.dv : null;
}

const pctOf = (value: number, goal: number | null) =>
  goal && goal > 0 ? Math.round((value / goal) * 100) : null;

const STICKY = { position: "sticky" as const, left: 0, background: "var(--paper)" };

function NutrientTable({ n, goals }: { n: Nutrients; goals: Goals }) {
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
        {LABEL_ROWS.map((r) => {
          const goal = goalFor(r.key, goals);
          const pct = pctOf(n[r.key], goal);
          const over = pct != null && pct > 100;
          return (
            <tr key={r.key} style={{ borderTop: "1px solid var(--line)" }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: r.bold ? 700 : 400, padding: "4px 8px 4px 0", paddingLeft: r.indent ? 14 : 0 }}>{r.label}</th>
              <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: r.bold ? 700 : 400 }}>{nfmt(n[r.key])}{r.unit}</td>
              <td style={{ textAlign: "right", padding: "4px 8px", color: "var(--sage)" }}>{goal != null ? `${goal}${r.unit}` : "—"}</td>
              <td style={{ textAlign: "right", padding: "4px 0", fontWeight: 600, color: over ? "#9c3a1f" : "var(--ink)" }}>{pct != null ? `${pct}%` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Same table, plus a column per SLOT (day mode) — meals sharing a slot are
// summed into one column. Horizontal-scrolls; first column sticky.
function SlotNutrientTable({ n, goals, meals }: { n: Nutrients; goals: Goals; meals: MealLine[] }) {
  // group meals by slot, preserving first-seen order
  const order: string[] = [];
  const bySlot = new Map<string, MealLine[]>();
  for (const m of meals) {
    if (!bySlot.has(m.slotName)) { bySlot.set(m.slotName, []); order.push(m.slotName); }
    bySlot.get(m.slotName)!.push(m);
  }
  const slots = order.map((slot) => {
    const ms = bySlot.get(slot)!;
    return {
      slot,
      estimate: ms.every((m) => m.estimate),
      value: (key: keyof Nutrients) => ms.reduce((a, m) => a + (m.nutrients[key] || 0), 0),
    };
  });
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
        <thead>
          <tr style={{ color: "var(--sage)" }}>
            <th style={{ ...STICKY, textAlign: "left", padding: "4px 10px 4px 0", fontWeight: 600 }}>Nutrient</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Total</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Goal</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>%</th>
            {slots.map((s) => (
              <th key={s.slot} style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>
                {s.estimate ? "≈ " : ""}{s.slot}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LABEL_ROWS.map((r) => {
            const goal = goalFor(r.key, goals);
            const pct = pctOf(n[r.key], goal);
            const over = pct != null && pct > 100;
            return (
              <tr key={r.key} style={{ borderTop: "1px solid var(--line)" }}>
                <th scope="row" style={{ ...STICKY, textAlign: "left", fontWeight: r.bold ? 700 : 400, padding: "4px 10px 4px 0", paddingLeft: r.indent ? 14 : 0 }}>{r.label}</th>
                <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: r.bold ? 700 : 400 }}>{nfmt(n[r.key])}{r.unit}</td>
                <td style={{ textAlign: "right", padding: "4px 8px", color: "var(--sage)" }}>{goal != null ? `${goal}${r.unit}` : "—"}</td>
                <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600, color: over ? "#9c3a1f" : "var(--ink)" }}>{pct != null ? `${pct}%` : "—"}</td>
                {slots.map((s) => (
                  <td key={s.slot} style={{ textAlign: "right", padding: "4px 8px" }}>{nfmt(s.value(r.key))}{r.unit}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
