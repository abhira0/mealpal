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

// A meal's "series" — meals that share one collapse into a single spanning bar.
// Recurring meals share a ruleId; a batch shares batchId; otherwise same
// name+slot is treated as the same planned item repeated.
const seriesKey = (m: AgendaMeal) =>
  m.ruleId != null ? `r${m.ruleId}` : m.batchBacked && m.batchId != null ? `b${m.batchId}` : `n${m.slotId}:${m.name}`;

type Run = { s: number; e: number; meal: AgendaMeal; days: number; anyOut: boolean };

function editMeal(agenda: AgendaState, m: AgendaMeal) {
  if (m.batchBacked && m.batchId != null) agenda.openEditBatch(m.batchId);
  else if (m.eventId != null) agenda.openEditMeal(m);
}

export function DesktopPlan() {
  const [start, setStart] = useState(() => todayISO());
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });
  const today = todayISO();
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // Slots ordered by time of day; only those with meals this week are shown.
  const slots = useMemo(
    () => [...agenda.slots].sort((a, b) => (a.timeOfDay > b.timeOfDay ? 1 : a.timeOfDay < b.timeOfDay ? -1 : a.id - b.id)),
    [agenda.slots],
  );
  const dayIndex = useMemo(() => new Map(week.map((d, i) => [d, i])), [week]);

  // For each slot: collapse meals into contiguous-day runs (spanning bars).
  const laneBySlot = useMemo(() => {
    const out = new Map<number, Run[]>();
    const daysByDate = new Map(agenda.days.map((d) => [d.date, d]));
    for (const slot of slots) {
      const series = new Map<string, { i: number; m: AgendaMeal }[]>();
      week.forEach((date, i) => {
        for (const m of daysByDate.get(date)?.meals ?? []) {
          if (m.slotId !== slot.id) continue;
          const k = seriesKey(m);
          (series.get(k) ?? series.set(k, []).get(k)!).push({ i, m });
        }
      });
      const runs: Run[] = [];
      for (const occ of series.values()) {
        occ.sort((a, b) => a.i - b.i);
        let run: typeof occ = [];
        const flush = () => {
          if (!run.length) return;
          runs.push({
            s: run[0].i,
            e: run[run.length - 1].i,
            meal: run[0].m,
            days: run.length,
            anyOut: run.some((x) => x.m.outOfStock),
          });
          run = [];
        };
        for (const o of occ) {
          if (run.length && o.i !== run[run.length - 1].i + 1) flush();
          run.push(o);
        }
        flush();
      }
      runs.sort((a, b) => a.s - b.s || a.meal.name.localeCompare(b.meal.name));
      if (runs.length) out.set(slot.id, runs);
    }
    return out;
  }, [agenda.days, slots, week, dayIndex]);

  const counts = useMemo(() => {
    let planned = 0, cooked = 0, served = 0;
    for (const d of agenda.days)
      for (const m of d.meals) {
        if (m.phase === "planned") planned++;
        else if (m.phase === "cooked") cooked++;
        else served++;
      }
    return { planned, cooked, served };
  }, [agenda.days]);

  const activeSlots = slots.filter((s) => laneBySlot.has(s.id));

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
            <button type="button" className="btn" onClick={() => agenda.openAdd({ date: start })} disabled={agenda.loading}>+ Schedule</button>
          </>
        }
      >
        {agenda.mounted && (
          <div className="plan-cal" data-testid="plan-grid">
            <div className="plan-cal-row plan-cal-head">
              <div className="plan-slotlabel" />
              {week.map((d) => (
                <div key={d} className={`plan-colhead${d === today ? " today" : ""}`}>
                  <div>
                    <span className="dow">{DOW[dowOf(d)]}</span>{" "}
                    <span className="dnum">{dnumOf(d)}</span>
                  </div>
                  <button type="button" className="plan-coladd" aria-label={`Add meal on ${fmt(d)}`} onClick={() => agenda.openAdd({ date: d })}>+</button>
                </div>
              ))}
            </div>

            {activeSlots.length === 0 && <p className="empty" style={{ padding: 24 }}>Nothing planned this week — “+ Schedule” to add.</p>}

            {activeSlots.map((slot) => (
              <div key={slot.id} className="plan-cal-row">
                <div className="plan-slotlabel">{slot.name}</div>
                {laneBySlot.get(slot.id)!.map((r, idx) => (
                  <button
                    key={`${slot.id}-${idx}`}
                    type="button"
                    className={`plan-bar ${r.meal.phase}${r.anyOut ? " out" : ""}`}
                    style={{ gridColumn: `${r.s + 2} / ${r.e + 3}` }}
                    onClick={() => editMeal(agenda, r.meal)}
                    title={`${r.meal.name} · ${r.days} day${r.days > 1 ? "s" : ""}`}
                  >
                    <span className="plan-dot" aria-hidden="true" />
                    <span className="nm">{r.meal.name}</span>
                    {r.meal.batchBacked && r.meal.mealsRemaining != null && <span className="plan-left">{r.meal.mealsRemaining} left</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </DeskPage>

      <AgendaSheets agenda={agenda} />
    </>
  );
}
