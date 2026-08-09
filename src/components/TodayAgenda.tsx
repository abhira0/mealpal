"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { todayISO } from "@/lib/dates";

type Batch = { id: number; slotId: number; label: string; cookedDate: string; mealsTotal: number; mealsRemaining: number };
type Slot = { id: number; name: string; timeOfDay: string };

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export function TodayAgenda({ userName }: { userName?: string | null }) {
  // ponytail: server can't know the client's date/timezone, so all
  // time-derived text is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const todayIso = useMemo(todayISO, []);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/batches");
    if (res.ok) setBatches((await res.json()) as Batch[]);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [bRes, sRes] = await Promise.all([fetch("/api/batches"), fetch("/api/slots")]);
      if (!alive) return;
      if (bRes.ok) setBatches((await bRes.json()) as Batch[]);
      if (sRes.ok) setSlots((await sRes.json()) as Slot[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const slotName = useMemo(() => new Map(slots.map((s) => [s.id, s.name])), [slots]);

  async function eatOne(batch: Batch) {
    if (batch.mealsRemaining <= 0) return;
    // optimistic decrement, then reconcile from the response
    setBatches((prev) =>
      prev.map((b) => (b.id === batch.id ? { ...b, mealsRemaining: b.mealsRemaining - 1 } : b)),
    );
    const res = await fetch(`/api/batches/${batch.id}/eat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayISO() }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Batch;
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? updated : b)));
    } else {
      // reconcile from the server on failure too
      await loadBatches();
    }
  }

  const [packOpen, setPackOpen] = useState(false);

  const dateLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (!mounted) {
    return (
      <header className="chrome">
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
    <>
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
        {loading ? (
          <p className="loading">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="empty">No active batches — pack one below.</p>
        ) : (
          <div className="stack-sm">
            {batches.map((b) => {
              const empty = b.mealsRemaining <= 0;
              const low = b.mealsRemaining <= 1 && !empty;
              return (
                <div key={b.id} className="card" style={empty ? { opacity: 0.5 } : undefined}>
                  <div className="card-row">
                    <span className="title row-main">{b.label}</span>
                    <span className={low || empty ? "chip run" : "chip"}>
                      {empty ? "empty · cook" : low ? "1 left · cook soon" : `${b.mealsRemaining} left`}
                    </span>
                  </div>
                  <div className="card-row" style={{ marginTop: 12 }}>
                    <span className="slot">{slotName.get(b.slotId) ?? ""}</span>
                    <button type="button" className="btn" disabled={empty} onClick={() => eatOne(b)}>
                      Ate one
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="btn block" onClick={() => setPackOpen(true)}>
          ＋ Pack a batch
        </button>

        <Link href="/plan" className="btn-link">
          Open full planner
        </Link>
      </div>

      <Sheet open={packOpen} title="Pack a batch" onClose={() => setPackOpen(false)}>
        <div className="sh-body stack-sm" />
      </Sheet>
    </>
  );
}
