"use client";

import { useEffect, useState } from "react";
import type { IngredientNutritionRow, Nutrients, Goals, Scorecard } from "@/lib/nutrition";
import { FACT_ROWS } from "@/components/NutritionFacts";
import { EChart } from "@/components/EChart";
import { CalorieMacroRing, MACRO_COLOR } from "@/components/CalorieMacroRing";

function todayISO(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}

export default function NutritionPage() {
  const [tab, setTab] = useState<"overview" | "breakdown">("overview");
  const [mode, setMode] = useState<"day" | "week">("day");
  // Start empty so the server and first client render agree on the date input's
  // value; the server can't know the browser's timezone, so we fill in "today"
  // after mount. (Same reasoning as PlanEditor.) Avoids a hydration mismatch.
  const [date, setDate] = useState("");
  const [data, setData] = useState<AnalysisData | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const reqKey = `${mode}:${date}`;

  useEffect(() => { setDate(todayISO()); }, []);

  useEffect(() => {
    if (!date) return;
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

        {loading || !data ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : noMeals ? (
          <p style={{ opacity: 0.6 }}>No meals planned this week.</p>
        ) : tab === "overview" ? (
          <OverviewBody data={data} mode={mode} openCard={openCard} setOpenCard={setOpenCard} />
        ) : (
          <BreakdownBody data={data} mode={mode} date={date} />
        )}
      </div>
    </>
  );
}

// Columns: Calories + the standard label rows (reused so labels/units match).
const COLS = [{ key: "calories" as const, label: "Cal", unit: "" }, ...FACT_ROWS];

function IngredientsTable({ date, mode, eventIds }: { date: string; mode: "day" | "week"; eventIds?: number[] }) {
  const [basis, setBasis] = useState<"served" | "planned">("served");
  const idsParam = eventIds ? eventIds.join(",") : "";
  const key = `${mode}:${date}:${basis}:${idsParam}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: IngredientNutritionRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const eventIdsQS = idsParam ? `&eventIds=${idsParam}` : "";
    fetch(`/api/nutrition/ingredients?mode=${mode}&date=${date}&basis=${basis}${eventIdsQS}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setLoaded({ key, rows: d }); })
      .catch(() => { if (!cancelled) setLoaded({ key, rows: [] }); });
    return () => { cancelled = true; };
  }, [key, mode, date, basis, idsParam]);

  const basisPill = (
    <div className="filter" style={{ marginBottom: 8 }}>
      <button type="button" aria-pressed={basis === "served"} onClick={() => setBasis("served")}>Served</button>
      <button type="button" aria-pressed={basis === "planned"} onClick={() => setBasis("planned")}>Planned</button>
    </div>
  );

  if (loaded?.key !== key) return <>{basisPill}<p style={{ opacity: 0.6 }}>Loading…</p></>;
  const rows = loaded.rows;
  if (rows.length === 0) return <>{basisPill}<p style={{ opacity: 0.6 }}>No ingredients {basis === "served" ? "eaten" : "planned"} this {mode === "week" ? "week" : "day"}.</p></>;

  return (
    <>
      {basisPill}
      <p className="section-label">
        {basis === "served" ? "Actual quantity eaten" : "Planned quantity"} per ingredient this {mode === "week" ? "week" : "day"}.</p>
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

interface MealLine { eventId: number; slotName: string; recipeName: string; estimate: boolean; calories: number; nutrients: Nutrients; }

interface AnalysisData {
  mode: "day" | "week";
  goals: Goals;
  nutrients: Nutrients;
  planned: Nutrients;
  macros: { carbs: number; fat: number; protein: number };
  scorecards: Scorecard[];
  missing: string[];
  meals?: MealLine[];
  monday?: string;
  daysWithMeals?: number;
  perDay?: { date: string; total: Nutrients; hasMeals: boolean }[];
  _key?: string; // request this data was fetched for, to derive loading
}


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
// and scorecards. Goals are edited on /manage.
function OverviewBody({ data, mode, openCard, setOpenCard }: {
  data: AnalysisData; mode: "day" | "week";
  openCard: string | null; setOpenCard: (k: string | null) => void;
}) {
  const n = data.nutrients; // served/eaten total (planned meals contribute 0)
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

      <p className="section-label">Vs goal{mode === "week" ? " (daily avg)" : ""}</p>
      <MacroBar label="Calories" served={n.calories} planned={data.planned.calories} goal={goals.calorieGoal} unit="" color="var(--enamel-dark)" />
      <MacroBar label="Protein" served={n.proteinG} planned={data.planned.proteinG} goal={goals.proteinG} unit="g" color={MACRO_COLOR.protein} />
      <MacroBar label="Carbs" served={n.carbsG} planned={data.planned.carbsG} goal={goals.carbsG} unit="g" color={MACRO_COLOR.carbs} />
      <MacroBar label="Fat" served={n.fatG} planned={data.planned.fatG} goal={goals.fatG} unit="g" color={MACRO_COLOR.fat} />

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
    </>
  );
}

// Breakdown lens: nutrient table (Total/Goal/%) with the contribution columns
// toggled between by-slot and by-ingredient; plus the week macro-trend chart.
function BreakdownBody({ data, mode, date }: { data: AnalysisData; mode: "day" | "week"; date: string }) {
  const [view, setView] = useState<"meals" | "items" | "ingredients">("meals");
  const [basis, setBasis] = useState<"served" | "planned">("served");
  const [drill, setDrill] = useState<{ label: string; eventIds: number[] } | null>(null);
  useEffect(() => { setDrill(null); }, [date]);
  const dayMeals = mode === "day" && data.meals && data.meals.length > 0 ? data.meals : null;
  const mealN = basis === "served" ? data.nutrients : data.planned;
  return (
    <>
      {mode === "week" && data.perDay && <WeekTrend perDay={data.perDay} />}
      <div className="filter">
        <button type="button" aria-pressed={view === "meals"} onClick={() => { setView("meals"); setDrill(null); }}>Meals</button>
        <button type="button" aria-pressed={view === "items"} onClick={() => { setView("items"); setDrill(null); }}>Items</button>
        <button type="button" aria-pressed={view === "ingredients"} onClick={() => { setView("ingredients"); setDrill(null); }}>Ingredients</button>
      </div>
      {view === "ingredients" ? (
        <IngredientsTable date={date} mode={mode} />
      ) : (
        <>
          <div className="filter" style={{ marginBottom: 8 }}>
            <button type="button" aria-pressed={basis === "served"} onClick={() => setBasis("served")}>Served</button>
            <button type="button" aria-pressed={basis === "planned"} onClick={() => setBasis("planned")}>Planned</button>
          </div>
          <p className="section-label">
            {basis === "served" ? "Eaten" : "Planned"} nutrients{dayMeals ? ` — total, goal & by ${view === "items" ? "meal" : "slot"}` : mode === "week" ? " (daily avg) vs goal" : " vs goal"}
          </p>
          {dayMeals
            ? <GroupedNutrientTable n={mealN} goals={data.goals} meals={dayMeals} basis={basis}
                groupBy={view === "items" ? (m) => m.recipeName : (m) => m.slotName}
                onGroupClick={view === "items" ? setDrill : undefined} />
            : <NutrientTable n={mealN} goals={data.goals} />}
          {view === "items" && drill && (
            <>
              <p className="section-label">Ingredients — {drill.label}</p>
              <IngredientsTable date={date} mode={mode} eventIds={drill.eventIds} />
            </>
          )}
        </>
      )}
      <MissingNotice missing={data.missing} />
    </>
  );
}

// Two bars per nutrient — served (actual) and planned (full day's plan) — both
// scaled to the goal, so the track's full width is the goal.
function MacroBar({ label, served, planned, goal, unit, color }: {
  label: string; served: number; planned: number; goal: number; unit: string; color: string;
}) {
  // One track = goal. Served (solid) then the not-yet-served remainder of the
  // plan (faded) stacked after it. planned already includes served.
  const pct = (v: number) => (goal > 0 ? Math.min(100, (v / goal) * 100) : 0);
  const servedW = pct(served);
  const remW = Math.max(0, pct(planned) - servedW);
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <b>{label}</b>
        <span className="mono" style={{ fontSize: 11, color: "var(--sage)" }}>
          {Math.round(served)} served · {Math.round(planned)} planned / {goal}{unit}
        </span>
      </div>
      <div title={`${Math.round(served)} served · ${Math.round(planned)} planned / ${goal}${unit} goal`}
        style={{ display: "flex", height: 8, borderRadius: 99, background: "#e3ddcc", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${servedW}%`, background: color }} />
        <div style={{ height: "100%", width: `${remW}%`, background: color, opacity: 0.45 }} />
      </div>
    </div>
  );
}

const nfmt = (x: number) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x));

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

// Same table, plus a column per group (by slot, or by individual meal name) —
// meals sharing a group key are summed into one column. Horizontal-scrolls;
// first column sticky.
function GroupedNutrientTable({ n, goals, meals, basis, groupBy, onGroupClick }: {
  n: Nutrients; goals: Goals; meals: MealLine[]; basis: "served" | "planned"; groupBy: (m: MealLine) => string;
  onGroupClick?: (group: { label: string; eventIds: number[] }) => void;
}) {
  const order: string[] = [];
  const bySlot = new Map<string, MealLine[]>();
  for (const m of meals) {
    const key = groupBy(m);
    if (!bySlot.has(key)) { bySlot.set(key, []); order.push(key); }
    bySlot.get(key)!.push(m);
  }
  const slots = order.map((slot) => {
    const ms = bySlot.get(slot)!;
    return {
      slot,
      eventIds: ms.map((m) => m.eventId),
      // served basis: only eaten meals count, so an all-estimate slot reads 0 (≈).
      // planned basis: every meal counts, columns sum to the planned Total.
      estimate: basis === "served" && ms.every((m) => m.estimate),
      value: (key: keyof Nutrients) =>
        ms.reduce((a, m) => a + ((basis === "planned" || !m.estimate) ? (m.nutrients[key] || 0) : 0), 0),
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
                {s.estimate ? "≈ " : ""}
                {onGroupClick ? (
                  <button type="button" style={{ font: "inherit", color: "inherit", background: "none", border: 0, padding: 0, textDecoration: "underline", cursor: "pointer" }}
                    onClick={() => onGroupClick({ label: s.slot, eventIds: s.eventIds })}>{s.slot}</button>
                ) : s.slot}
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
