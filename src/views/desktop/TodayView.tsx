"use client";

import Link from "next/link";
import { DeskPage } from "@/components/DeskPage";
import { useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList, NextCooking, TodayVsGoal, initials } from "@/views/agenda-parts";
import { CalorieMacroRing } from "@/components/CalorieMacroRing";

export function DesktopToday({ userName }: { userName?: string | null }) {
  const agenda = useAgenda(userName);
  const { mounted, todayIso, nextCooks, analysis } = agenda;

  const dateLabel = mounted
    ? new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : " ";

  return (
    <>
      <DeskPage
        title={dateLabel}
        testId="desktop-today"
        actions={
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        }
      >
        {mounted && (
          <div
            className="dash-grid"
            data-testid="dash"
            style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(340px,1fr)" }}
          >
            {/* Left column: the day-by-day agenda timeline. */}
            <div className="dash-col">
              <p className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>
                Agenda
              </p>
              {agenda.actionError && <p className="notice" role="alert">{agenda.actionError}</p>}
              <AgendaList agenda={agenda} manage={false} />
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
        )}
      </DeskPage>

      <AgendaSheets agenda={agenda} />
    </>
  );
}
