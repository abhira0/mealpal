"use client";

import Link from "next/link";
import { Pencil, X, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { localNoon } from "@/lib/dates";
import type { AgendaMeal, AgendaState, DayAnalysis, NextCook } from "@/views/agenda-data";

export const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Colors for the per-row phase chip: planned (taupe, not yet acted on),
// cooked (amber, batch serving ready but not eaten today), served (green,
// eaten/counts toward nutrition).
const PHASE_CHIP: Record<AgendaMeal["phase"], { bg: string; fg: string }> = {
  planned: { bg: "var(--surface-3)", fg: "var(--ink-2)" },
  cooked: { bg: "var(--warn-weak)", fg: "var(--warn)" },
  served: { bg: "var(--ok-weak)", fg: "var(--ok)" },
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
  if (diffDays === 1) return "Tomorrow";
  return localNoon(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// One meal row: checkbox (eat/cook), name + slot, batch chip, remove.
export function MealRow({
  meal,
  date,
  agenda,
  manage = true,
  onInspect,
}: {
  meal: AgendaMeal;
  date: string;
  agenda: AgendaState;
  // Today passes manage=false: status changes only (eat / cook), no edit/remove.
  manage?: boolean;
  // When set (Plan), an event-backed row shows a control that opens the full
  // meal Inspector instead of the scattered inline edit/remove buttons.
  onInspect?: (meal: AgendaMeal) => void;
}) {
  const { acting, toggleMeal, cookAhead, uncookAhead, openEditBatch, openEditMeal, requestRemove, removeBatch } = agenda;
  const checked = meal.phase === "served";
  const key =
    meal.batchBacked && meal.batchId != null ? `batch:${meal.batchId}` : `event:${meal.eventId}`;
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
      style={meal.outOfStock ? { background: "var(--danger-weak)", borderColor: "var(--danger-line)" } : undefined}
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
          <div style={{ color: "var(--danger)", fontSize: "0.66em", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
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
        // Remount on phase change so the entry "pop" fires; the bg/color also
        // ease between states. One authored moment for the core loop.
        key={meal.phase}
        className="phase-chip"
        aria-label={`Status: ${meal.phase}`}
        style={{
          background: meal.outOfStock ? "var(--danger)" : PHASE_CHIP[meal.phase].bg,
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
      {/* Edit/remove are management actions — hidden on Today (manage=false),
          which is status-changes only. */}
      {/* Plan: one control opens the full Inspector for an event-backed meal,
          replacing the inline edit/remove pair. */}
      {onInspect && meal.eventId != null && (
        <button
          type="button"
          className="btn-add"
          aria-label={`Manage ${meal.name}`}
          style={{ padding: "4px 10px", minHeight: "auto" }}
          onClick={() => onInspect(meal)}
        >
          <SlidersHorizontal size={16} />
        </button>
      )}
      {manage &&
        ((!onInspect && !meal.batchBacked && meal.phase !== "served" && meal.eventId != null) ||
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
      {manage && !onInspect && meal.eventId != null && (
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
      {manage && meal.batchBacked && meal.batchId != null && (
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
      <div className="macro-track">
        <div className="macro-seg" style={{ background: color, opacity: 0.45, transform: `scaleX(${(cookedW + remW) / 100})` }} />
        <div className="macro-seg" style={{ background: color, transform: `scaleX(${cookedW / 100})` }} />
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
          const overdue = nc.daysAway < 0;
          const inLabel = overdue
            ? nc.daysAway === -1 ? "overdue by 1 day" : `overdue by ${-nc.daysAway} days`
            : nc.daysAway === 0 ? "today" : nc.daysAway === 1 ? "tomorrow" : `in ${nc.daysAway} days`;
          return (
            <div
              key={`${nc.slotId}-${nc.label}-${nc.cookDate}`}
              className="card"
              style={{ flex: "1 1 0", minWidth: 140, padding: 12, ...(overdue ? { borderColor: "var(--danger-line)" } : {}) }}
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
                  background: overdue ? "var(--danger-weak)" : "var(--accent-2-weak)",
                  color: overdue ? "var(--danger)" : "var(--accent-2-ink)",
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
export function AgendaList({ agenda, manage = true }: { agenda: AgendaState; manage?: boolean }) {
  const { days, loading, todayIso, todayRef, expandedPast, togglePast, openAdd } = agenda;
  if (loading)
    return (
      <div className="stack-sm" aria-busy="true" aria-label="Loading agenda">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="row skel" style={{ height: 64 }} />
        ))}
      </div>
    );
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
              style={isToday ? { color: "var(--accent-ink)", borderTopColor: "var(--accent)" } : undefined}
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
                {manage &&
                  day.cookFlags.map((flag, i) => (
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
                      manage={manage}
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
