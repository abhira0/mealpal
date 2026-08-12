"use client";

import Link from "next/link";
import { Pencil, X, AlertTriangle } from "lucide-react";
import { localNoon } from "@/lib/dates";
import type { AgendaMeal, AgendaState, DayAnalysis, NextCook } from "@/views/agenda-data";

export const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Colors for the per-row phase chip: planned (taupe, not yet acted on),
// cooked (amber, batch serving ready but not eaten today), served (green,
// eaten/counts toward nutrition).
const PHASE_CHIP: Record<AgendaMeal["phase"], { bg: string; fg: string }> = {
  planned: { bg: "#EDEEF1", fg: "#5B6069" },
  cooked: { bg: "#FBF1DC", fg: "#B26B00" },
  served: { bg: "#E8F3EB", fg: "#2F8F52" },
};

export function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export function dayHeaderLabel(date: string, todayIso: string): string {
  if (date === todayIso) return "Today";
  const diffDays = Math.round((localNoon(date).getTime() - localNoon(todayIso).getTime()) / 86_400_000);
  if (diffDays === -1) return "Yesterday";
  return localNoon(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// One meal row: checkbox (eat/cook), name + slot, batch chip, remove.
export function MealRow({ meal, date, agenda }: { meal: AgendaMeal; date: string; agenda: AgendaState }) {
  const { acting, toggleMeal, cookAhead, uncookAhead, openEditBatch, openEditMeal, requestRemove, removeBatch } = agenda;
  const checked = meal.phase === "served";
  const key = meal.batchBacked && meal.batchId != null ? meal.batchId : meal.eventId;
  // "Cook ahead" only makes sense for a real, not-yet-touched rotation meal —
  // batch rows already consumed their stock at pack time.
  const showCook = !meal.batchBacked && meal.phase === "planned" && meal.eventId != null;
  // Undo a cook-ahead (optional per spec): only on a cooked, non-batch row.
  const showUncook = !meal.batchBacked && meal.phase === "cooked" && meal.eventId != null;
  const empty = meal.mealsRemaining != null && meal.mealsRemaining <= 0;
  const low = meal.mealsRemaining != null && meal.mealsRemaining <= 1;
  return (
    <div
      className="row"
      style={meal.outOfStock ? { background: "#FCECEC", borderColor: "#F3C9C9" } : undefined}
    >
      <button
        type="button"
        className="checkbox"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? `${meal.name} eaten, tap to undo` : `Mark ${meal.name} eaten`}
        disabled={acting === key}
        onClick={() => toggleMeal(meal, date)}
      />
      <div className="row-main">
        {(() => {
          // Link the name to its recipe/product/ingredient page. Batch rows
          // (synthetic — all ids null) stay plain text: no redirect.
          const href =
            meal.recipeId != null
              ? `/recipes/${meal.recipeId}`
              : meal.productId != null
                ? `/manage/products/${meal.productId}`
                : meal.ingredientId != null
                  ? `/manage/ingredients/${meal.ingredientId}`
                  : null;
          return href ? (
            <Link href={href} className="title">
              {meal.name}
            </Link>
          ) : (
            <div>{meal.name}</div>
          );
        })()}
        <span className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>
          {meal.slotName}
        </span>
        {meal.outOfStock && (
          <div style={{ color: "#DC2B2B", fontSize: "0.66em", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} /> out of stock: {meal.missingItems.join(", ")}
          </div>
        )}
      </div>
      {meal.batchBacked && (
        <span className={low ? "chip run" : "chip"}>
          {empty ? "empty · cook" : low ? "cook soon" : `${meal.mealsRemaining} left`}
        </span>
      )}
      {showCook && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Cook ${meal.name} ahead`}
          disabled={acting === key}
          style={{ padding: "3px 9px", minHeight: "auto", fontSize: 11 }}
          onClick={() => cookAhead(meal)}
        >
          Cook
        </button>
      )}
      {showUncook && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Undo cooking ${meal.name}`}
          disabled={acting === key}
          style={{ padding: "3px 9px", minHeight: "auto", fontSize: 11 }}
          onClick={() => uncookAhead(meal)}
        >
          Undo
        </button>
      )}
      <span
        aria-label={`Status: ${meal.phase}`}
        style={{
          background: meal.outOfStock ? "#DC2B2B" : PHASE_CHIP[meal.phase].bg,
          color: meal.outOfStock ? "#fff" : PHASE_CHIP[meal.phase].fg,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          borderRadius: 99,
          padding: "3px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {meal.phase}
      </span>
      {/* Edit: planned meals (in place) and batches (full re-pack). */}
      {((!meal.batchBacked && meal.phase === "planned" && meal.eventId != null) ||
        (meal.batchBacked && meal.batchId != null)) && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Edit ${meal.name}`}
          style={{ padding: "4px 8px", minHeight: "auto" }}
          onClick={() => (meal.batchBacked ? openEditBatch(meal.batchId!) : openEditMeal(meal))}
        >
          <Pencil size={15} />
        </button>
      )}
      {meal.eventId != null && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Remove ${meal.name}`}
          style={{ padding: "4px 10px", minHeight: "auto" }}
          onClick={() => requestRemove(meal)}
        >
          <X size={16} />
        </button>
      )}
      {meal.batchBacked && meal.batchId != null && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Delete ${meal.name} meal prep`}
          style={{ padding: "4px 10px", minHeight: "auto" }}
          onClick={() => removeBatch(meal.batchId!)}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// Two bars per nutrient — eaten (solid) then the not-yet-eaten remainder of
// the plan (faded) — both scaled to the goal, mirroring the nutrition page.
export function MacroBar({ label, cooked, planned, goal, unit, color }: {
  label: string; cooked: number; planned: number; goal: number; unit: string; color: string;
}) {
  const pct = (v: number) => (goal > 0 ? Math.min(100, (v / goal) * 100) : 0);
  const cookedW = pct(cooked);
  const remW = Math.max(0, pct(planned) - cookedW);
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <b>{label}</b>
        <span className="mono" style={{ fontSize: 11, color: "var(--sage)" }}>
          {Math.round(cooked)} / {goal}{unit}
        </span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 99, background: "#EDEEF1", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${cookedW}%`, background: color }} />
        <div style={{ height: "100%", width: `${remW}%`, background: color, opacity: 0.45 }} />
      </div>
    </div>
  );
}

// The "Next cooking" carousel of prep cards. Returns null when nothing relevant.
export function NextCooking({ nextCooks }: { nextCooks: NextCook[] }) {
  if (nextCooks.length === 0) return null;
  // ponytail: hardcoded to what the user cares about right now; revisit if this needs to be configurable
  const visibleCooks = nextCooks.filter(
    (nc) =>
      nc.slotName === "Lunch" ||
      nc.slotName === "Dinner" ||
      nc.label.toLowerCase().includes("overnight oats"),
  );
  if (visibleCooks.length === 0) return null;
  return (
    <div>
      <p className="section-label">Next cooking</p>
      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
        {visibleCooks.map((nc) => {
          const dateLabel = localNoon(nc.cookDate)
            .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            .replace(/^(\w{3})\./, "$1"); // strip a trailing period on the weekday, if any
          const inLabel = nc.daysAway === 0 ? "today" : nc.daysAway === 1 ? "tomorrow" : `in ${nc.daysAway} days`;
          return (
            <div
              key={nc.slotId}
              className="card"
              style={{ flex: "1 1 0", minWidth: 140, padding: 12 }}
            >
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>
                {nc.slotName.toLowerCase()} prep
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", margin: "3px 0 6px" }}>{nc.label}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{dateLabel}</div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  background: "var(--accent-2-weak)",
                  color: "var(--accent-2-ink)",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: "3px 9px",
                }}
              >
                {inLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The "Today vs goal" macro block (4 stacked MacroBars).
export function TodayVsGoal({ analysis }: { analysis: DayAnalysis }) {
  return (
    <div>
      <p className="section-label">Today vs goal</p>
      <MacroBar
        label="Calories"
        cooked={analysis.nutrients.calories}
        planned={analysis.planned.calories}
        goal={analysis.goals.calorieGoal}
        unit=""
        color="var(--paprika)"
      />
      <MacroBar
        label="Protein"
        cooked={analysis.nutrients.proteinG}
        planned={analysis.planned.proteinG}
        goal={analysis.goals.proteinG}
        unit="g"
        color="var(--accent)"
      />
      <MacroBar
        label="Carbs"
        cooked={analysis.nutrients.carbsG}
        planned={analysis.planned.carbsG}
        goal={analysis.goals.carbsG}
        unit="g"
        color="var(--accent)"
      />
      <MacroBar
        label="Fat"
        cooked={analysis.nutrients.fatG}
        planned={analysis.planned.fatG}
        goal={analysis.goals.fatG}
        unit="g"
        color="var(--accent)"
      />
    </div>
  );
}

// The day-by-day agenda timeline (cook-flags + meal rows, past days collapse).
// Shared verbatim between the mobile and desktop layouts.
export function AgendaList({ agenda }: { agenda: AgendaState }) {
  const { days, loading, todayIso, todayRef, expandedPast, togglePast, openAdd } = agenda;
  if (loading) return <p className="loading">Loading…</p>;
  if (days.length === 0) return <p className="empty">Nothing on the agenda — tap + to add.</p>;
  return (
    <div className="stack-sm">
      {days.map((day) => {
        const isToday = day.date === todayIso;
        const isPast = day.date < todayIso;
        const expanded = !isPast || expandedPast.has(day.date);
        return (
          <div key={day.date} ref={isToday ? todayRef : undefined}>
            <p
              className="section-label"
              style={isToday ? { color: "var(--paprika)", borderTopColor: "var(--paprika)" } : undefined}
            >
              {dayHeaderLabel(day.date, todayIso)}
            </p>

            {isPast && (
              <button
                type="button"
                className="empty"
                style={{ padding: "0 0 8px", textAlign: "left", background: "none", border: "none", cursor: "pointer", width: "100%", color: "inherit" }}
                onClick={() => togglePast(day.date)}
                aria-expanded={expanded}
              >
                {day.eatenCount}/{day.totalCount} eaten{day.eatenCount === day.totalCount && day.totalCount > 0 ? " ✓" : ""}
                {" "}
                {expanded ? "▾" : "▸"}
              </button>
            )}

            {expanded && (
              // Not ".stack-sm": the desktop layout turns any stack whose
              // direct children are ".row" into a multi-column grid (see
              // globals.css), which made a day's cook-flag row and meal
              // rows render side-by-side instead of stacked. This day
              // section must always stay a single full-width column.
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {day.cookFlags.map((flag, i) => (
                  <button
                    key={`${day.date}-${flag.slotId}-${i}`}
                    type="button"
                    className="row"
                    style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer" }}
                    onClick={() => openAdd({ date: day.date, slotId: flag.slotId, type: "batch" })}
                  >
                    <span className="row-main">Cook {flag.label}</span>
                    <span className="chip run">{flag.slotName}</span>
                  </button>
                ))}

                {day.meals.length === 0 ? (
                  <p className="empty" style={{ padding: "0 0 8px", textAlign: "left" }}>
                    Nothing planned.
                  </p>
                ) : (
                  day.meals.map((meal) => (
                    <MealRow
                      key={meal.eventId != null ? `ev-${meal.eventId}` : `batch-${meal.batchId}-${meal.slotId}-${day.date}`}
                      meal={meal}
                      date={day.date}
                      agenda={agenda}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
