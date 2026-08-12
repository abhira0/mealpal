"use client";

import Link from "next/link";
import { useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList, NextCooking, TodayVsGoal, initials } from "@/views/agenda-parts";

export function MobileToday({ userName }: { userName?: string | null }) {
  const agenda = useAgenda(userName);
  const { mounted, todayIso, nextCooks, analysis, loading, openAdd } = agenda;

  const dateLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (!mounted) {
    return (
      <header className="chrome" data-testid="mobile-today">
        <div className="chrome-row">
          <div>
            <p className="eb">&nbsp;</p>
            <h1>&nbsp;</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>
    );
  }

  return (
    <div data-testid="mobile-today">
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <p className="eb">Today</p>
            <h1>{dateLabel}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>

      <div className="content stack">
        {mounted && <NextCooking nextCooks={nextCooks} />}

        {analysis && <TodayVsGoal analysis={analysis} />}

        <AgendaList agenda={agenda} />
      </div>

      {/* Floating "+" FAB opens the merged Add sheet directly. Disabled
          while loading: opening the sheet early locks the default item's
          refId to null (recipes/products not fetched yet), leaving the
          form stuck invalid. Sits above the bottom nav (z-index 30) but
          below the Sheet's scrim/panel (z-index 40/41) so an open sheet
          still covers it. */}
      <button
        type="button"
        aria-label="Add"
        disabled={loading}
        onClick={() => openAdd()}
        style={{
          position: "fixed",
          right: 20,
          bottom: 84,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--paprika)",
          color: "#fff",
          border: "none",
          fontSize: 28,
          lineHeight: 1,
          boxShadow: "0 6px 16px rgba(0,0,0,.25)",
          zIndex: 35,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: loading ? "default" : "pointer",
        }}
      >
        +
      </button>

      <AgendaSheets agenda={agenda} />
    </div>
  );
}
