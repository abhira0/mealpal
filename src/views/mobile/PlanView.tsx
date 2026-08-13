"use client";

import { useMemo, useState } from "react";
import { addDays, useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList } from "@/views/agenda-parts";
import { todayISO } from "@/lib/dates";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Manage the schedule: a navigable 7-day window over planned / cooked / served
// meals, backed by the same agenda hook + sheets as Today.
export function MobilePlan() {
  const [start, setStart] = useState(() => todayISO());
  const end = useMemo(() => addDays(start, 6), [start]);
  const agenda = useAgenda(null, { from: start, to: end });

  return (
    <div data-testid="mobile-plan">
      <header className="chrome">
        <h1>Plan</h1>
      </header>

      <main className="content stack">
        {agenda.mounted && (
          <>
            <div className="filter" style={{ justifyContent: "space-between", width: "100%" }}>
              <button type="button" onClick={() => setStart((s) => addDays(s, -7))} aria-label="Previous week">
                ‹ Prev
              </button>
              <span className="mono" style={{ fontSize: 13, alignSelf: "center", color: "var(--ink-2)" }}>
                {fmt(start)} – {fmt(end)}
              </span>
              <button type="button" onClick={() => setStart((s) => addDays(s, 7))} aria-label="Next week">
                Next ›
              </button>
            </div>

            <button type="button" className="btn block" onClick={() => agenda.openAdd()} disabled={agenda.loading}>
              + Schedule a meal
            </button>

            <AgendaList agenda={agenda} />
          </>
        )}
      </main>

      <AgendaSheets agenda={agenda} />
    </div>
  );
}
