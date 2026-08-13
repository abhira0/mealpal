"use client";

import { useMemo, useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import { addDays, useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList } from "@/views/agenda-parts";
import { todayISO } from "@/lib/dates";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DesktopPlan() {
  const [start, setStart] = useState(() => todayISO());
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });

  // Roll up meal states across the visible week for the summary rail.
  const counts = useMemo(() => {
    let planned = 0, cooked = 0, served = 0;
    for (const d of agenda.days)
      for (const m of d.meals) {
        if (m.phase === "planned") planned++;
        else if (m.phase === "cooked") cooked++;
        else if (m.phase === "served") served++;
      }
    return { planned, cooked, served, total: planned + cooked + served };
  }, [agenda.days]);

  return (
    <>
      <DeskPage
        title="Plan"
        testId="desktop-plan"
        sub={agenda.mounted ? `${fmt(start)} – ${fmt(end)}` : undefined}
        actions={
          <button type="button" className="btn" onClick={() => agenda.openAdd()} disabled={agenda.loading}>
            + Schedule a meal
          </button>
        }
      >
        {agenda.mounted && (
          <div className="md-layout" data-testid="md-layout">
            <div className="md-list">
              <AgendaList agenda={agenda} />
            </div>

            <aside style={{ position: "sticky", top: 24 }}>
              <div className="card" style={{ padding: 16 }}>
                <div className="filter" style={{ justifyContent: "space-between", width: "100%", marginBottom: 14 }}>
                  <button type="button" onClick={() => setStart((s) => addDays(s, -7))} aria-label="Previous week">
                    ‹ Prev
                  </button>
                  <button type="button" onClick={() => setStart(todayISO())}>This week</button>
                  <button type="button" onClick={() => setStart((s) => addDays(s, 7))} aria-label="Next week">
                    Next ›
                  </button>
                </div>

                <p className="section-label" style={{ marginTop: 0 }}>This week · {counts.total}</p>
                <div className="stack-sm">
                  <div className="row" style={{ minHeight: 0, padding: "10px 12px" }}>
                    <span className="row-main">Planned</span>
                    <span className="chip">{counts.planned}</span>
                  </div>
                  <div className="row" style={{ minHeight: 0, padding: "10px 12px" }}>
                    <span className="row-main">Cooked</span>
                    <span className="chip low">{counts.cooked}</span>
                  </div>
                  <div className="row" style={{ minHeight: 0, padding: "10px 12px" }}>
                    <span className="row-main">Served</span>
                    <span className="chip" style={{ background: "var(--ok-weak)", color: "var(--ok)", borderColor: "var(--ok-line)" }}>
                      {counts.served}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </DeskPage>

      <AgendaSheets agenda={agenda} />
    </>
  );
}
