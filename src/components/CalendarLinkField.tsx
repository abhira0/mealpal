"use client";

import { useState } from "react";
import { CopyField } from "@/components/CopyField";

// Feed URL + Copy + Regenerate. Regenerating overwrites the household's stored
// calendarToken, so the previously-copied URL 404s the next time a calendar
// app re-polls it.
export function CalendarLinkField({ hid, initialToken }: { hid: number; initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/${hid}/${token}`;

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/regenerate", { method: "POST" });
      if (res.ok) {
        const { token: next } = await res.json();
        setToken(next);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <CopyField value={url} />
      <button type="button" className="btn" onClick={regenerate} disabled={busy}>
        {busy ? "Regenerating…" : "Regenerate calendar link"}
      </button>
    </div>
  );
}
