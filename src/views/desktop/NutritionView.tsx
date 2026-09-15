"use client";

import { useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import {
  OverviewBody,
  BreakdownBody,
  useNutritionAnalysis,
  useTodayDate,
  todayISO,
  isoAddDays,
  shortDate,
} from "@/views/nutrition-shared";
import { Skeleton } from "@/components/Skeleton";

// Desktop dashboard: no tabs. A shared top bar (Day/Week + date control) drives
// a single fetch; Overview and Breakdown sit side by side, both reading the same
// analysis data.
export function DesktopNutrition() {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useTodayDate();
  const [openCard, setOpenCard] = useState<string | null>(null);

  const { data, loading, noMeals } = useNutritionAnalysis(mode, date);

  return (
    <DeskPage title="What you ate" testId="desktop-nutrition">
      <div className="stack">
        <div className="filter" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="filter">
            <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
            <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
          </div>

          {mode === "day" ? (
            <label className="field" htmlFor="nutrition-date" style={{ margin: 0 }}>
              <span className="field-label">Date</span>
              <input id="nutrition-date" className="input" type="date" value={date}
                onChange={(e) => setDate(e.target.value || todayISO())} />
            </label>
          ) : (
            <div className="filter" style={{ alignItems: "center" }}>
              <button type="button" onClick={() => setDate(isoAddDays(date, -7))}>‹ Prev</button>
              <span className="mono" style={{ fontSize: 12 }}>
                {data?.monday ? `${shortDate(data.monday)} – ${shortDate(isoAddDays(data.monday, 6))}` : "…"}
              </span>
              <button type="button" onClick={() => setDate(isoAddDays(date, 7))}>Next ›</button>
            </div>
          )}
        </div>

        {loading || !data ? (
          <div className="dash-grid dash-nutrition" aria-busy="true" aria-label="Loading nutrition">
            <Skeleton height={280} radius={16} />
            <Skeleton height={280} radius={16} />
          </div>
        ) : noMeals ? (
          <p className="empty">No meals planned this week.</p>
        ) : (
          <div className="dash-grid dash-nutrition" data-testid="dash">
            <section className="dash-col">
              <OverviewBody data={data} mode={mode} openCard={openCard} setOpenCard={setOpenCard} />
            </section>
            <section className="dash-col">
              <BreakdownBody data={data} mode={mode} date={date} />
            </section>
          </div>
        )}
      </div>
    </DeskPage>
  );
}
