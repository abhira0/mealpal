"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { EntityForm } from "@/components/EntityForm";
import { EditDeleteActions } from "@/components/EditDeleteActions";

type Slot = { id: number; name: string; timeOfDay: string };

export function SlotDetail({ id }: { id: string }) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/slots", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load this slot.");
      return;
    }
    const all: Slot[] = await res.json();
    setSlot(all.find((s) => s.id === Number(id)) ?? null);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; state set after await, not synchronously
    load();
  }, [load]);

  if (!slot) {
    return (
      <div className="content">
        {error ? <p className="notice">{error}</p> : <p className="loading">Loading…</p>}
      </div>
    );
  }

  return (
    <>
      <header className="chrome">
        <Link href="/manage/slots" className="chrome-back">← Meal slots</Link>
        <h1>{slot.name}</h1>
      </header>

      <div className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        <section className="card stack-sm">
          <div className="ing-row" style={{ paddingTop: 0 }}>
            <span className="meta" style={{ flex: 1 }}>Time of day</span>
            <span className="nm mono">{slot.timeOfDay}</span>
          </div>
        </section>

        <EditDeleteActions
          singular="slot"
          deletePath={`/api/slots/${id}`}
          backHref="/manage/slots"
          onEdit={() => setEditing(true)}
        />
      </div>

      <Sheet open={editing} title="Edit slot" onClose={() => setEditing(false)}>
        <EntityForm slug="slots" id={id} embedded onDone={() => { setEditing(false); load(); }} />
      </Sheet>
    </>
  );
}
