"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { DeskPage } from "@/components/DeskPage";
import { PlanInspector } from "@/components/PlanInspector";
import { Sheet } from "@/components/Sheet";
import { addDays, useAgenda, type AgendaMeal } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { DOW } from "@/views/agenda-parts";
import { Trash2 } from "lucide-react";
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

// `meal` rides along so clicking a day in the inspector's status strip can
// retarget it at that day's event.
type Cell = { date: string; phase: "planned" | "cooked" | "served"; meal: AgendaMeal };
type Run = { s: number; e: number; meal: AgendaMeal; days: number; anyOut: boolean; cells: Cell[] };

// One drop target per (slot, day). Invisible; dnd-kit hit-tests by measured rect,
// so pointer-events stay off and bar clicks pass straight through.
function DropCell({ slotId, dayIndex }: { slotId: number; dayIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${slotId}:${dayIndex}` });
  return <div ref={setNodeRef} className={`plan-drop-cell${isOver ? " over" : ""}`} aria-hidden="true" />;
}

const PHASE_BG: Record<Cell["phase"], string> = {
  planned: "var(--surface-2)",
  cooked: "var(--warn-weak)",
  served: "var(--ok-weak)",
};

/** `background` for a run: equal-width hard-stop bands, one per day. */
function dayBands(cells: Cell[]): string | undefined {
  if (!cells.length) return undefined;
  if (cells.every((c) => c.phase === cells[0].phase)) return PHASE_BG[cells[0].phase];
  const stops = cells.flatMap((c, i) => {
    const bg = PHASE_BG[c.phase];
    return [`${bg} ${(i / cells.length) * 100}%`, `${bg} ${((i + 1) / cells.length) * 100}%`];
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// A spanning bar. Planned event-backed bars are draggable (reschedule); the
// click-to-open still works because the pointer sensor only starts a drag past a
// small movement threshold.
function PlanBar({
  r, selected, onOpen, onDeleteBatch,
}: {
  r: Run;
  selected: boolean;
  onOpen: () => void;
  onDeleteBatch?: () => void;
}) {
  const draggable = !r.meal.batchBacked && r.meal.eventId != null && r.meal.phase === "planned";
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: `ev:${r.meal.eventId ?? 0}`,
    disabled: !draggable,
  });
  // Per-day tint: a bar spans several days whose statuses can differ, so paint
  // one hard-stop gradient band per day instead of a single colour for the run.
  // Shortage (.out) keeps its red — that warning outranks status.
  const bandBg = r.anyOut ? undefined : dayBands(r.cells);
  const style: React.CSSProperties = {
    gridColumn: `${r.s + 2} / ${r.e + 3}`,
    ...(bandBg ? ({ "--bar-bg": bandBg } as React.CSSProperties) : {}),
    zIndex: isDragging ? 5 : 1,
    ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : {}),
    ...(isDragging ? { opacity: 0.4 } : {}),
  };
  return (
    <div
      ref={setNodeRef}
      className={`plan-bar ${r.meal.phase}${r.anyOut ? " out" : ""}${selected ? " selected" : ""}${draggable ? " draggable" : ""}`}
      style={style}
    >
      <button
        type="button"
        className="plan-bar-main"
        onClick={onOpen}
        title={`${r.meal.name} · ${r.days} day${r.days > 1 ? "s" : ""}`}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <span className="plan-dot" aria-hidden="true" />
        <span className="nm">{r.meal.name}</span>
        {r.meal.batchBacked && r.meal.mealsRemaining != null && <span className="plan-left">{r.meal.mealsRemaining} left</span>}
      </button>
      {onDeleteBatch && (
        <button type="button" className="plan-bar-act" aria-label={`Delete ${r.meal.name} meal prep`} onClick={onDeleteBatch}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function DesktopPlan() {
  const [start, setStart] = useState(() => addDays(todayISO(), -1));
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });
  const today = todayISO();
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // Slots ordered by time of day; only those with meals this week are shown.
  const slots = useMemo(
    () => [...agenda.slots].sort((a, b) => (a.timeOfDay > b.timeOfDay ? 1 : a.timeOfDay < b.timeOfDay ? -1 : a.id - b.id)),
    [agenda.slots],
  );

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
            cells: run.map((x) => ({ date: week[x.i], phase: x.m.phase, meal: x.m })),
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
  }, [agenda.days, slots, week]);

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

  // Clicking an event-backed bar opens the inspector; a batch bar edits directly.
  const [sel, setSel] = useState<{ meal: AgendaMeal; cells: Cell[]; focusDate: string } | null>(null);
  function openBar(r: Run) {
    if (r.meal.batchBacked && r.meal.batchId != null) { setSel(null); agenda.openEditBatch(r.meal.batchId); return; }
    if (r.meal.eventId != null) { agenda.setAddOpen(false); setSel({ meal: r.meal, cells: r.cells, focusDate: week[r.s] }); }
  }
  // Open the unified create form in the panel (clears any selected meal).
  function openCreate(date: string) { setSel(null); agenda.openAdd({ date }); }

  // "n" / "[" / "]" shortcuts (src/components/DesktopShortcuts.tsx): mirror
  // the "+ Schedule" button and the "‹"/"›" week-nav buttons exactly.
  useEffect(() => {
    function onNew() { openCreate(start); }
    function onPrev() { setStart((s) => addDays(s, -7)); }
    function onNext() { setStart((s) => addDays(s, 7)); }
    window.addEventListener("platr:shortcut-new", onNew);
    window.addEventListener("platr:shortcut-prev", onPrev);
    window.addEventListener("platr:shortcut-next", onNext);
    return () => {
      window.removeEventListener("platr:shortcut-new", onNew);
      window.removeEventListener("platr:shortcut-prev", onPrev);
      window.removeEventListener("platr:shortcut-next", onNext);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // Drag-and-drop reschedule: drag a planned bar onto another day/slot cell.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragName, setDragName] = useState<string | null>(null);
  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (!id.startsWith("ev:")) return;
    for (const runs of laneBySlot.values())
      for (const r of runs) if (r.meal.eventId === Number(id.slice(3))) setDragName(r.meal.name);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragName(null);
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : "";
    if (!active.startsWith("ev:") || !over.startsWith("drop:")) return;
    const eventId = Number(active.slice(3));
    const [, slotStr, dayStr] = over.split(":");
    const date = week[Number(dayStr)];
    if (date) void agenda.rescheduleEvent(eventId, date, Number(slotStr));
  }

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
            <button type="button" className="btn-secondary" onClick={() => setStart(addDays(today, -1))}>Today</button>
            <button type="button" className="btn-secondary" onClick={() => setStart((s) => addDays(s, 7))} aria-label="Next week">›</button>
            <button type="button" className="btn" onClick={() => openCreate(start)} disabled={agenda.loading}>+ Schedule</button>
          </>
        }
      >
        {agenda.mounted && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="plan-workspace">
              <div className="plan-cal" data-testid="plan-grid">
                <div className="plan-cal-row plan-cal-head">
                  <div className="plan-slotlabel" />
                  {week.map((d) => (
                    <div key={d} className={`plan-colhead${d === today ? " today" : ""}`}>
                      <div>
                        <span className="dow">{DOW[dowOf(d)]}</span>{" "}
                        <span className="dnum">{dnumOf(d)}</span>
                      </div>
                      <button type="button" className="plan-coladd" aria-label={`Add meal on ${fmt(d)}`} onClick={() => openCreate(d)}>+</button>
                    </div>
                  ))}
                </div>

                {activeSlots.length === 0 && <p className="empty" style={{ padding: 24 }}>Nothing planned this week — “+ Schedule” to add.</p>}

                {activeSlots.map((slot) => (
                  <div key={slot.id} className="plan-cal-row">
                    <div className="plan-slotlabel">{slot.name}</div>
                    {/* Invisible drop grid behind the bars (drag-to-reschedule). */}
                    <div className="plan-drop-layer">
                      {week.map((_, i) => <DropCell key={i} slotId={slot.id} dayIndex={i} />)}
                    </div>
                    {laneBySlot.get(slot.id)!.map((r, idx) => (
                      <PlanBar
                        key={`${slot.id}-${idx}`}
                        r={r}
                        selected={sel?.meal.eventId != null && sel.meal.eventId === r.meal.eventId}
                        onOpen={() => openBar(r)}
                        onDeleteBatch={r.meal.batchBacked && r.meal.batchId != null ? () => agenda.removeBatch(r.meal.batchId!) : undefined}
                      />
                    ))}
                  </div>
                ))}
              </div>

            </div>
            <DragOverlay dropAnimation={null}>
              {dragName ? <div className="plan-bar planned plan-drag-ghost"><span className="plan-dot" /><span className="nm">{dragName}</span></div> : null}
            </DragOverlay>
          </DndContext>
        )}
      </DeskPage>

      {/* Meal details live in a wide centered modal (not a side rail) so the
          status strip, stock, macros and actions get room to sit side by side. */}
      <Sheet
        wide
        open={sel !== null}
        title={sel ? `${sel.meal.name} · ${sel.meal.slotName}` : "Meal"}
        onClose={() => setSel(null)}
      >
        {sel && (
          <PlanInspector
            key={sel.meal.eventId!}
            meal={sel.meal}
            agenda={agenda}
            cells={sel.cells}
            focusDate={sel.focusDate}
            onPickDay={(date) => {
              const c = sel.cells.find((x) => x.date === date);
              if (c?.meal.eventId != null) setSel({ meal: c.meal, cells: sel.cells, focusDate: date });
            }}
            hideHeader
            onClose={() => setSel(null)}
          />
        )}
      </Sheet>

      <AgendaSheets agenda={agenda} />
    </>
  );
}
