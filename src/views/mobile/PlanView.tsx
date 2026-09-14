"use client";

import { useMemo, useState } from "react";
import { addDays, useAgenda, type AgendaMeal } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { MealRow, DOW } from "@/views/agenda-parts";
import { Sheet } from "@/components/Sheet";
import { PlanInspector } from "@/components/PlanInspector";
import { todayISO } from "@/lib/dates";

const dowOf = (iso: string) => new Date(iso + "T00:00:00").getDay();
const dnumOf = (iso: string) => new Date(iso + "T00:00:00").getDate();
const longLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

// Planner: pick a day on the week strip, arrange that day's meals. Distinct
// from Today (which is the operational timeline of the next few days).
export function MobilePlan() {
  const [start, setStart] = useState(() => addDays(todayISO(), -1));
  const [selected, setSelected] = useState(() => addDays(todayISO(), -1));
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });
  const today = todayISO();

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDate = useMemo(() => new Map(agenda.days.map((d) => [d.date, d])), [agenda.days]);
  const slots = useMemo(
    () => [...agenda.slots].sort((a, b) => (a.timeOfDay > b.timeOfDay ? 1 : a.timeOfDay < b.timeOfDay ? -1 : a.id - b.id)),
    [agenda.slots],
  );
  const shiftWeek = (n: number) => {
    const ns = addDays(start, n * 7);
    setStart(ns);
    setSelected(ns);
  };

  const day = byDate.get(selected);
  const meals = day?.meals ?? [];

  // Tapping a meal's manage control opens the full Inspector in a bottom sheet.
  const [sheetMeal, setSheetMeal] = useState<AgendaMeal | null>(null);

  return (
    <div data-testid="mobile-plan">
      <header className="chrome">
        <h1>Plan</h1>
      </header>

      <main className="content stack">
        {agenda.mounted && (
          <>
            <div className="filter" style={{ justifyContent: "space-between", width: "100%" }}>
              <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week">‹</button>
              <button type="button" onClick={() => { setStart(today); setSelected(today); }}>This week</button>
              <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week">›</button>
            </div>

            <div className="week" role="tablist" aria-label="Week">
              {week.map((d) => {
                const has = (byDate.get(d)?.meals.length ?? 0) > 0;
                const cls = `day${d === selected ? " on" : ""}${d === today ? " day--today" : ""}`;
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    className={cls}
                    aria-selected={d === selected}
                    onClick={() => setSelected(d)}
                  >
                    <span className="dow">{DOW[dowOf(d)]}</span>
                    <span className="dnum">{dnumOf(d)}</span>
                    {has && <span className="dot" />}
                  </button>
                );
              })}
            </div>

            <div className="chrome-row" style={{ padding: 0, alignItems: "center" }}>
              <p className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>{longLabel(selected)}</p>
              <button type="button" className="btn" style={{ padding: "8px 14px", minHeight: "auto" }}
                onClick={() => agenda.openAdd({ date: selected })} disabled={agenda.loading}>
                + Add
              </button>
            </div>

            {meals.length === 0 ? (
              <p className="empty">Nothing planned — tap “+ Add”.</p>
            ) : (
              slots.map((slot) => {
                const sm = meals.filter((m) => m.slotId === slot.id);
                if (sm.length === 0) return null;
                return (
                  <div key={slot.id}>
                    <p className="section-label">{slot.name}</p>
                    <div className="stack-sm">
                      {sm.map((m) => (
                        <MealRow
                          key={m.eventId != null ? `e${m.eventId}` : `b${m.batchId}-${m.slotId}`}
                          meal={m}
                          date={selected}
                          agenda={agenda}
                          onInspect={setSheetMeal}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </main>

      <Sheet open={sheetMeal !== null} title={sheetMeal?.name ?? "Meal"} onClose={() => setSheetMeal(null)}>
        {sheetMeal && (
          <PlanInspector
            key={sheetMeal.eventId!}
            meal={sheetMeal}
            agenda={agenda}
            focusDate={selected}
            hideHeader
            onClose={() => setSheetMeal(null)}
          />
        )}
      </Sheet>

      <AgendaSheets agenda={agenda} />
    </div>
  );
}
