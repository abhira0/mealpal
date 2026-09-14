"use client";

import Link from "next/link";
import { useAgenda } from "@/views/agenda-data";
import { AgendaSheets } from "@/views/AgendaSheets";
import { AgendaList, NextCooking, TodayVsGoal, initials } from "@/views/agenda-parts";

export function MobileToday({ userName }: { userName?: string | null }) {
  const agenda = useAgenda(userName);
  const { mounted, todayIso, nextCooks, analysis } = agenda;

  const dateLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (!mounted) {
    return (
      <header className="chrome" data-testid="mobile-today">
        <div className="chrome-row">
          <div aria-hidden="true">
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
        {agenda.actionError && <p className="notice" role="alert">{agenda.actionError}</p>}

        {mounted && <NextCooking nextCooks={nextCooks} />}

        {analysis && <TodayVsGoal analysis={analysis} />}

        {/* Today is status-only (eat / cook); scheduling lives on the Plan page. */}
        <AgendaList agenda={agenda} manage={false} />
      </div>

      <AgendaSheets agenda={agenda} />
    </div>
  );
}
