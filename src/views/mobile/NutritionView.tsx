"use client";

import { useState } from "react";
import {
  OverviewBody,
  BreakdownBody,
  useNutritionAnalysis,
  useTodayDate,
  todayISO,
  isoAddDays,
  shortDate,
} from "@/views/nutrition-shared";

export function MobileNutrition() {
  const [tab, setTab] = useState<"overview" | "breakdown">("overview");
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useTodayDate();
  const [openCard, setOpenCard] = useState<string | null>(null);

  const { data, loading, noMeals } = useNutritionAnalysis(mode, date);

  return (
    <div data-testid="mobile-nutrition">
      <header className="chrome">
        <h1>What you ate</h1>
      </header>

      <div className="content stack">
        <div className="tabs">
          <button type="button" aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" aria-pressed={tab === "breakdown"} onClick={() => setTab("breakdown")}>Breakdown</button>
        </div>

        <div className="filter">
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
        </div>

        {mode === "day" ? (
          <label className="field" htmlFor="nutrition-date">
            <span className="field-label">Date</span>
            <input id="nutrition-date" className="input" type="date" value={date}
              onChange={(e) => setDate(e.target.value || todayISO())} />
          </label>
        ) : (
          <div className="filter" style={{ justifyContent: "space-between" }}>
            <button type="button" onClick={() => setDate(isoAddDays(date, -7))}>‹ Prev</button>
            <span className="mono" style={{ fontSize: 12 }}>
              {data?.monday ? `${shortDate(data.monday)} – ${shortDate(isoAddDays(data.monday, 6))}` : "…"}
            </span>
            <button type="button" onClick={() => setDate(isoAddDays(date, 7))}>Next ›</button>
          </div>
        )}

        {loading || !data ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : noMeals ? (
          <p style={{ opacity: 0.6 }}>No meals planned this week.</p>
        ) : tab === "overview" ? (
          <OverviewBody data={data} mode={mode} openCard={openCard} setOpenCard={setOpenCard} />
        ) : (
          <BreakdownBody data={data} mode={mode} date={date} />
        )}
      </div>
    </div>
  );
}
