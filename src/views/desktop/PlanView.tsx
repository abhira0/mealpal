"use client";

import { useMemo, useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import { addDays, useAgenda, type AgendaMeal, type AgendaState } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { DOW } from "@/views/agenda-parts";
import { todayISO } from "@/lib/dates";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dowOf = (iso: string) => new Date(iso + "T00:00:00").getDay();
const dnumOf = (iso: string) => new Date(iso + "T00:00:00").getDate();

function editMeal(agenda: AgendaState, m: AgendaMeal) {
  if (m.batchBacked && m.batchId != null) agenda.openEditBatch(m.batchId);
  else if (m.eventId != null) agenda.openEditMeal(m);
}

// A compact planner cell — name + phase dot; click to edit/reschedule. (Eating
// and cooking happen on Today; Plan is for arranging the week.)
function Cell({ m, date, agenda }: { m: AgendaMeal; date: string; agenda: AgendaState }) {
  const editable = (m.batchBacked && m.batchId != null) || m.eventId != null;
  return (
    <button
      type="button"
      className={`plan-cell${m.outOfStock ? " out" : ""}`}
      disabled={!editable}
      onClick={() => editMeal(agenda, m)}
      title={`${m.name} — ${m.phase}`}
    >
      <span className={`plan-dot ${m.phase}`} aria-hidden="true" />
      <span className="nm">{m.name}</span>
      {m.batchBacked && m.mealsRemaining != null && <span className="plan-left">{m.mealsRemaining}</span>}
    </button>
  );
}

export function DesktopPlan() {
  const [start, setStart] = useState(() => todayISO());
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });
  const today = todayISO();

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDate = useMemo(() => {
    const m = new Map(agenda.days.map((d) => [d.date, d]));
    return m;
  }, [agenda.days]);

  const counts = useMemo(() => {
    let planned = 0, cooked = 0, served = 0;
    for (const d of agenda.days)
      for (const meal of d.meals) {
        if (meal.phase === "planned") planned++;
        else if (meal.phase === "cooked") cooked++;
        else served++;
      }
    return { planned, cooked, served };
  }, [agenda.days]);

  return (
    <>
      <DeskPage
        title="Plan"
        testId="desktop-plan"
        sub={
          agenda.mounted
            ? `${fmt(start)} – ${fmt(end)} · ${counts.planned} planned · ${counts.cooked} cooked · ${counts.served} served`
            : undefined
        }
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setStart((s) => addDays(s, -7))} aria-label="Previous week">‹</button>
            <button type="button" className="btn-secondary" onClick={() => setStart(today)}>This week</button>
            <button type="button" className="btn-secondary" onClick={() => setStart((s) => addDays(s, 7))} aria-label="Next week">›</button>
            <button type="button" className="btn" onClick={() => agenda.openAdd({ date: start })} disabled={agenda.loading}>
              + Schedule
            </button>
          </>
        }
      >
        {agenda.mounted && (
          <div className="plan-grid" data-testid="plan-grid">
            {week.map((date) => {
              const day = byDate.get(date);
              const meals = day?.meals ?? [];
              const isToday = date === today;
              return (
                <div key={date} className={`plan-day${isToday ? " today" : ""}`}>
                  <div className="plan-day-head">
                    <span className="plan-dow">{DOW[dowOf(date)]}</span>
                    <span className="plan-dnum">{dnumOf(date)}</span>
                  </div>
                  <div className="plan-day-body">
                    {meals.map((m) => (
                      <Cell key={m.eventId != null ? `e${m.eventId}` : `b${m.batchId}-${m.slotId}`} m={m} date={date} agenda={agenda} />
                    ))}
                    <button type="button" className="plan-add" onClick={() => agenda.openAdd({ date })} aria-label={`Add meal on ${fmt(date)}`}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DeskPage>

      <AgendaSheets agenda={agenda} />
    </>
  );
}
