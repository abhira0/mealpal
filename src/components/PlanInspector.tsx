"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { SkeletonRows } from "@/components/Skeleton";
import type { InspectResult } from "@/lib/inspect";
import type { AgendaMeal, AgendaState } from "@/views/agenda-data";
import type { DeleteScope } from "@/lib/plan";

type Cell = { date: string; phase: "planned" | "cooked" | "served"; eventId?: number | null };

type DayRow = {
  date: string;
  servings: number;
  status: string;
  macros: { calories: number; proteinG: number; carbsG: number; fatG: number };
};

const dow = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });

/**
 * The Plan "command center" for one meal event: status, stock impact, macros,
 * and every action (cook/serve/uncook/unserve/edit/delete) with a scope choice
 * for recurring meals. Fetches its own detail from /api/events/[id]/inspect and
 * asks the parent to refresh the board after any mutation. Rendered in the
 * desktop side panel and inside a mobile Sheet — same component, no chrome.
 */
export function PlanInspector({
  meal, agenda, cells, focusDate, onPickDay, onClose, hideHeader = false,
}: {
  meal: AgendaMeal;
  agenda: AgendaState;
  cells?: Cell[]; // per-day phases of this meal's run, for the status strip
  focusDate?: string;
  // Retarget the inspector at another day of the run. Without it the strip is
  // read-only and every action applies to the day the panel was opened on.
  onPickDay?: (date: string) => void;
  onClose: () => void;
  hideHeader?: boolean; // embedded in a Sheet that already shows a title/close
}) {
  const eventId = meal.eventId!; // caller guarantees an event-backed row
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<InspectResult | null>(null);
  const [scope, setScope] = useState<DeleteScope>("one");
  const [tab, setTab] = useState<"details" | "nutrition">("details");
  const [perDay, setPerDay] = useState<DayRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/inspect`, { cache: "no-store" });
    setData(res.ok ? ((await res.json()) as InspectResult) : null);
  }, [eventId]);

  // (Scope resets to "one" automatically: the parent remounts this component
  // via key={eventId} when the selected meal changes.)

  // Reload the detail whenever the meal changes AND after any board refresh, so
  // serving via the shared agenda flow (which reloads agenda.days) keeps the
  // inspector in sync without bespoke plumbing.
  useEffect(() => {
    // Inlined (rather than calling load()) so this is a plain fetch/then
    // chain instead of a call to a function that sets state.
    fetch(`/api/events/${eventId}/inspect`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d as InspectResult | null));
  }, [eventId, agenda.days]);

  // A meal snapshot with the freshest phase/variant, so delegating serve/unserve
  // to the agenda flow toggles the right direction even if the prop went stale.
  const freshMeal: AgendaMeal = data
    ? { ...meal, status: data.event.status, phase: data.event.status, cookedAhead: data.event.cookedAhead }
    : meal;

  const recurring = data?.event.ruleId != null;

  // Run an action, then refresh both the inspector and the board.
  async function act(fn: () => Promise<Response>, closeAfter = false) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(e?.error ?? "Action failed");
        return;
      }
      if (closeAfter) { onClose(); return; }
      await load();
    } finally {
      await agenda.reload();
      setBusy(false);
    }
  }

  // Cook honestly: try without force so the stock guard fires; on a shortage,
  // show what's missing and let the user cook anyway (stock goes negative).
  async function cook() {
    if (busy) return;
    const s = recurring ? scope : "one";
    const send = (force: boolean) => fetch(`/api/events/${eventId}/cook`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: s, force }),
    });
    setBusy(true);
    try {
      let res = await send(false);
      if (res.status === 409) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!(await confirm(`${e?.error ?? "Not enough stock"}. Cook anyway (stock goes negative)?`))) return;
        res = await send(true);
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(e?.error ?? "Could not cook.");
        return;
      }
      await load();
    } finally {
      await agenda.reload();
      setBusy(false);
    }
  }
  const uncook = () => act(() => fetch(`/api/events/${eventId}/cook`, { method: "DELETE" }));
  // Delegate to the shared serve flow: it asks which product/variant was eaten
  // (via the cook-choice sheet in AgendaSheets) when the meal is ambiguous, and
  // toggles serve↔unserve by the fresh phase. The board reload it triggers
  // refreshes this inspector through the effect above.
  const toggleServe = () => agenda.toggleMeal(freshMeal, focusDate ?? data?.event.date ?? "");
  // Optimistic delete: close the inspector immediately and schedule the actual
  // DELETE ~6s out via the shared agenda undo queue (see useAgenda), which also
  // hides the row from the board right away. Tapping the toast's Undo cancels
  // the pending fetch — since nothing was ever sent, the row is exactly the
  // same server row, not a recreated one.
  const del = () => {
    const s = recurring ? scope : "one";
    const message = recurring && s !== "one" ? "Occurrences deleted." : "Meal deleted.";
    onClose();
    const cancel = agenda.scheduleEventDelete(eventId, s);
    toast.success(message, { durationMs: 6000, action: { label: "Undo", onClick: cancel } });
  };
  // openEditMeal un-cooks first when needed (cooked meals are locked server-side).
  const edit = () => { onClose(); agenda.openEditMeal(meal); };

  // Inline reschedule (planned only): move this one occurrence to a new day/slot.
  // Seeded once per event so a board reload doesn't clobber an in-progress edit.
  const [rDate, setRDate] = useState("");
  const [rSlot, setRSlot] = useState<number | null>(null);
  const seededFor = useRef<number | null>(null);
  useEffect(() => {
    if (data && seededFor.current !== data.event.id) {
      setRDate(data.event.date);
      setRSlot(data.event.slotId);
      seededFor.current = data.event.id;
    }
  }, [data]);

  function move() {
    if (!data || rSlot == null || !rDate) return;
    const e = data.event;
    const item = e.recipeId != null
      ? { recipeId: e.recipeId, servings: e.servings }
      : e.productId != null
        ? (e.amount != null
            ? { productId: e.productId, variantId: e.variantId, amount: e.amount }
            : { productId: e.productId, variantId: e.variantId, servings: e.servings })
        : { ingredientId: e.ingredientId, amount: e.amount };
    // scope=one: moving a date only affects this occurrence (the API won't
    // propagate date changes across a series).
    return act(() => fetch(`/api/events/${eventId}?scope=one`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: rDate, slotId: rSlot, ...item }),
    }));
  }
  const rescheduleChanged = !!data && (rDate !== data.event.date || rSlot !== data.event.slotId);

  const phase = data?.event.status ?? meal.phase;

  // Live status strip: recompute this meal's per-day phases from the board on
  // every reload (the `cells` prop is only a first-paint fallback, and would go
  // stale after a cook/serve). Matches by rule, else slot+name.
  const strip = useMemo<Cell[]>(() => {
    if (!data) return cells ?? [];
    const my = data.event.ruleId != null ? `r${data.event.ruleId}` : `n${data.event.slotId}:${data.event.name}`;
    const key = (m: AgendaMeal) => (m.ruleId != null ? `r${m.ruleId}` : `n${m.slotId}:${m.name}`);
    const out: Cell[] = [];
    for (const d of agenda.days) {
      const m = d.meals.find((mm) => key(mm) === my);
      if (m) out.push({ date: d.date, phase: m.phase, eventId: m.eventId });
    }
    return out.length ? out : (cells ?? []);
  }, [data, agenda.days, cells]);

  // Per-day nutrition: /inspect already returns one event's servings + macros,
  // so the whole run is that same call per day. Only fetched when the tab is open.
  const dayIds = strip.map((c) => c.eventId ?? 0).join(",");
  useEffect(() => {
    if (tab !== "nutrition") return;
    let live = true;
    const days = dayIds.split(",").map(Number);
    void Promise.all(
      strip.map(async (c, i): Promise<DayRow | null> => {
        if (!days[i]) return null;
        const res = await fetch(`/api/events/${days[i]}/inspect`, { cache: "no-store" });
        if (!res.ok) return null;
        const d = (await res.json()) as InspectResult;
        return { date: c.date, servings: d.event.servings, status: d.event.status, macros: d.macros };
      }),
    ).then((rows) => { if (live) setPerDay(rows.filter((r): r is DayRow => r !== null)); });
    return () => { live = false; };
    // strip is derived from dayIds; keying on the id list keeps this from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dayIds]);

  const perDayTotal = (perDay ?? []).reduce(
    (a, r) => ({
      servings: a.servings + r.servings,
      calories: a.calories + r.macros.calories,
      proteinG: a.proteinG + r.macros.proteinG,
      carbsG: a.carbsG + r.macros.carbsG,
      fatG: a.fatG + r.macros.fatG,
    }),
    { servings: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return (
    <div className="insp" data-tab={tab} data-testid="plan-inspector">
      {!hideHeader && (
        <div className="insp-head">
          <div>
            <div className="insp-title">{data?.event.name ?? meal.name}</div>
            <div className="insp-sub">
              {(data?.event.slotName ?? meal.slotName)}
              {data?.event.variantName ? ` · ${data.event.variantName}` : ""}
              {recurring ? " · repeats" : ""}
            </div>
          </div>
          <button type="button" className="plan-bar-act" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
      )}

      <div className="insp-tabs">
        {(["details", "nutrition"] as const).map((t) => (
          <button key={t} type="button" className={`chip${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
            {t === "details" ? "Details" : "Nutrition"}
          </button>
        ))}
      </div>

      {tab === "nutrition" && (
        <div className="insp-sec insp-full">
          <span className="field-label">Nutrition per day</span>
          {perDay == null ? (
            <div aria-busy="true" aria-label="Loading nutrition totals">
              <SkeletonRows count={4} height={16} gap={6} />
            </div>
          ) : perDay.length === 0 ? (
            <div className="insp-line">No days to total.</div>
          ) : (
            <table className="insp-tbl">
              <thead>
                <tr>
                  <th>Day</th><th>Servings</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {perDay.map((r) => (
                  <tr key={r.date} className={r.date === focusDate ? "focus" : undefined}>
                    <td>{dow(r.date)} {Number(r.date.slice(8))}</td>
                    <td>{Math.round(r.servings * 100) / 100}</td>
                    <td>{r.macros.calories}</td>
                    <td>{r.macros.proteinG}g</td>
                    <td>{r.macros.carbsG}g</td>
                    <td>{r.macros.fatG}g</td>
                    <td><span className={`chip phase-${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{perDay.length} day{perDay.length > 1 ? "s" : ""}</td>
                  <td>{Math.round(perDayTotal.servings * 100) / 100}</td>
                  <td>{perDayTotal.calories}</td>
                  <td>{perDayTotal.proteinG}g</td>
                  <td>{perDayTotal.carbsG}g</td>
                  <td>{perDayTotal.fatG}g</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
          {data && data.missing.length > 0 && (
            <div className="insp-line insp-miss">missing data: {data.missing.join(", ")}</div>
          )}
        </div>
      )}

      {tab === "details" && strip.length > 0 && (
        <div className="insp-sec">
          <span className="field-label">Status</span>
          <div className="insp-strip">
            {strip.map((c) => {
              const cls = `insp-day ${c.phase}${c.date === focusDate ? " focus" : ""}`;
              return onPickDay ? (
                <button key={c.date} type="button" className={cls} onClick={() => onPickDay(c.date)}
                  aria-pressed={c.date === focusDate} title={`Show ${c.date}`}>
                  {dow(c.date)}
                </button>
              ) : (
                <span key={c.date} className={cls}>{dow(c.date)}</span>
              );
            })}
          </div>
        </div>
      )}

      {tab === "details" && recurring && (
        <div className="insp-sec">
          <span className="field-label">Scope (cook / delete)</span>
          <div className="insp-scope">
            {(["one", "following", "all"] as const).map((s) => (
              <button key={s} type="button" className={`chip${scope === s ? " on" : ""}`} onClick={() => setScope(s)}>
                {s === "one" ? "This day" : s === "following" ? "+ Following" : "Whole series"}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "details" && (
      <div className="insp-sec">
        <span className="field-label">Details</span>
        <div className="insp-line">
          <span className={`chip phase-${phase}`}>{phase}</span>
          {data ? ` ${Math.max(1, Math.round(data.event.servings))} serving${data.event.servings >= 1.5 ? "s" : ""}` : ""}
        </div>
      </div>
      )}

      {tab === "details" && data && data.stock.length > 0 && (
        <div className="insp-sec">
          <span className="field-label">Stock impact</span>
          {data.stock.map((s) => (
            <div key={s.ingredientId} className={`insp-line${s.short ? " short" : ""}`}>
              {s.ingredientName}: needs {s.needed}{s.unit} · {s.onHand}{s.unit} on hand {s.short ? "⚠" : "✓"}
            </div>
          ))}
        </div>
      )}

      {tab === "details" && data && (
        <div className="insp-sec">
          <span className="field-label">Macros</span>
          <div className="insp-line">
            {data.macros.calories} kcal · {data.macros.proteinG}g P · {data.macros.carbsG}g C · {data.macros.fatG}g F
            {data.missing.length > 0 ? <span className="insp-miss"> · missing: {data.missing.join(", ")}</span> : null}
          </div>
        </div>
      )}

      {tab === "details" && phase === "planned" && (
        <div className="insp-sec">
          <span className="field-label">Reschedule</span>
          <div className="insp-resched">
            <input
              type="date"
              className="input"
              value={rDate}
              onChange={(ev) => setRDate(ev.target.value)}
              aria-label="New date"
            />
            <Dropdown
              label="Slot"
              value={rSlot}
              options={agenda.slots.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => setRSlot(Number(id))}
            />
            <button type="button" className="btn-secondary" disabled={busy || !rescheduleChanged} onClick={move}>Move</button>
          </div>
        </div>
      )}

      <div className="insp-actions">
        {/* Label carries the scope: the strip above is a status readout, so a bare
            "Cook" reads as if it covers every day shown. */}
        {phase === "planned" && (
          <button type="button" className="btn" disabled={busy} onClick={cook}>
            {!recurring || scope === "one" ? "Cook this day" : scope === "following" ? "Cook + following" : "Cook whole series"}
          </button>
        )}
        {phase === "cooked" && <button type="button" className="btn-secondary" disabled={busy} onClick={uncook}>Uncook</button>}
        {phase !== "served" && <button type="button" className="btn" disabled={busy} onClick={toggleServe}>Serve</button>}
        {phase === "served" && <button type="button" className="btn-secondary" disabled={busy} onClick={toggleServe}>Unserve</button>}
        {phase !== "served" && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={edit}>
            {phase === "cooked" ? "Uncook & edit" : "Edit"}
          </button>
        )}
        <button type="button" className="btn-secondary danger" disabled={busy} onClick={del}>Delete</button>
      </div>
    </div>
  );
}
