"use client";

import Link from "next/link";
import { useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList, NextCooking, TodayVsGoal, initials } from "@/views/agenda-parts";
import { CalorieMacroRing } from "@/components/CalorieMacroRing";

export function DesktopToday({ userName }: { userName?: string | null }) {
  const agenda = useAgenda(userName);
  const { mounted, todayIso, nextCooks, analysis, loading, openAdd } = agenda;

  const dateLabel = mounted
    ? new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : " ";

  return (
    <div data-testid="desktop-today">
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <h1>{dateLabel}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>

      {mounted && (
        <div className="content">
          <div className="dash-grid" data-testid="dash">
            {/* Left column: the day-by-day agenda timeline. */}
            <div className="dash-col">
              <div className="chrome-row" style={{ padding: 0 }}>
                <p className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>
                  Agenda
                </p>
                <button
                  type="button"
                  className="btn"
                  aria-label="Add"
                  disabled={loading}
                  onClick={() => openAdd()}
                  style={{ padding: "6px 14px", minHeight: "auto" }}
                >
                  + Add
                </button>
              </div>
              <AgendaList agenda={agenda} />
            </div>

            {/* Right column: next cooking, calorie ring, macros vs goal. */}
            <div className="dash-col">
              <NextCooking nextCooks={nextCooks} />

              {analysis && (
                <div className="card" style={{ padding: 16 }}>
                  <p className="section-label" style={{ marginTop: 0 }}>Calories &amp; macros</p>
                  <CalorieMacroRing
                    cal={Math.round(analysis.nutrients.calories)}
                    macros={analysis.macros}
                    goal={analysis.goals.calorieGoal}
                    n={{
                      carbsG: analysis.nutrients.carbsG,
                      fatG: analysis.nutrients.fatG,
                      proteinG: analysis.nutrients.proteinG,
                    }}
                  />
                </div>
              )}

              {analysis && <TodayVsGoal analysis={analysis} />}
            </div>
          </div>
        </div>
      )}

      <AgendaSheets agenda={agenda} />
    </div>
  );
}
