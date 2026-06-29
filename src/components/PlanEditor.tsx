"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { MealCard } from "@/components/MealCard";

type Slot = { id: number; name: string; timeOfDay: string };
type Recipe = { id: number; name: string; baseServings: number };
type MealEvent = {
  id: number;
  date: string;
  slotId: number;
  recipeId: number;
  servings: number;
  status: string;
  ruleId: number | null;
};

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 7-day window: 1 day back through 5 days ahead, centred on today. */
function weekDays(): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = -1; i <= 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export function PlanEditor({ userName }: { userName?: string | null }) {
  const days = useMemo(weekDays, []);
  const todayIso = isoOf(days[1]); // days[1] is today (window starts 1 day back)
  const from = isoOf(days[0]);
  const to = isoOf(days[days.length - 1]);

  const [selected, setSelected] = useState<string>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return isoOf(t);
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [events, setEvents] = useState<MealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-meal sheet state.
  const [addSlot, setAddSlot] = useState<Slot | null>(null);
  const [pickRecipe, setPickRecipe] = useState<number | null>(null);
  const [pickServings, setPickServings] = useState(2);
  const [saving, setSaving] = useState(false);

  // Repeat (recurring rule) state.
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<boolean[]>(() => Array(7).fill(true));
  const [intervalN, setIntervalN] = useState(1);
  const [unit, setUnit] = useState<"day" | "week">("day");
  const [until, setUntil] = useState("");

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/events?from=${from}&to=${to}`);
    if (res.ok) setEvents((await res.json()) as MealEvent[]);
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sRes, rRes, eRes] = await Promise.all([
        fetch("/api/slots"),
        fetch("/api/recipes"),
        fetch(`/api/events?from=${from}&to=${to}`),
      ]);
      if (!alive) return;
      if (sRes.ok) setSlots((await sRes.json()) as Slot[]);
      if (rRes.ok) setRecipes((await rRes.json()) as Recipe[]);
      if (eRes.ok) setEvents((await eRes.json()) as MealEvent[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  const daysWithMeals = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.date);
    return set;
  }, [events]);

  const recipeName = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.name])),
    [recipes],
  );

  const isToday = selected === todayIso;
  const selectedDate = new Date(selected + "T00:00:00");
  const dateLabel = selectedDate
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
  const heading = isToday
    ? greeting()
    : selectedDate.toLocaleDateString(undefined, { weekday: "long" });

  function cardsFor(slot: Slot) {
    return events
      .filter((e) => e.date === selected && e.slotId === slot.id)
      .map((ev) => (
        <MealCard
          key={ev.id}
          eventId={ev.id}
          title={recipeName.get(ev.recipeId) ?? "Recipe"}
          servings={ev.servings}
          recipeId={ev.recipeId}
          status={ev.status}
          recurring={ev.ruleId != null}
          onCooked={loadEvents}
          onDeleted={loadEvents}
        />
      ));
  }

  function openAdd(slot: Slot) {
    setAddSlot(slot);
    setPickRecipe(recipes[0]?.id ?? null);
    setPickServings(recipes[0]?.baseServings ?? 2);
    setRepeat(false);
    setRepeatDays(Array(7).fill(true));
    setIntervalN(1);
    setUnit("day");
    setUntil("");
  }

  async function saveMeal() {
    if (!addSlot || pickRecipe == null || saving) return;
    setSaving(true);
    const res = repeat
      ? await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: selected,
            slotId: addSlot.id,
            recipeId: pickRecipe,
            servings: pickServings,
            intervalN,
            unit,
            daysOfWeek: repeatDays.map((d) => (d ? "1" : "0")).join(""),
            untilDate: until || null,
          }),
        })
      : await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selected,
            slotId: addSlot.id,
            recipeId: pickRecipe,
            servings: pickServings,
          }),
        });
    setSaving(false);
    if (res.ok) {
      setAddSlot(null);
      await loadEvents();
    }
  }

  return (
    <>
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <p className="eb">{isToday ? `Today · ${dateLabel}` : dateLabel}</p>
            <h1>{heading}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>

      <div className="content">
        <div className="week" role="tablist" aria-label="Days">
          {days.map((d) => {
            const iso = isoOf(d);
            const on = iso === selected;
            const hasMeals = daysWithMeals.has(iso);
            return (
              <button
                key={iso}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? "day on" : "day"}
                onClick={() => setSelected(iso)}
              >
                <span className="dow">{DOW[d.getDay()]}</span>
                <span className="dnum">{d.getDate()}</span>
                {hasMeals ? <span className="dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 22 }}>
          {loading ? (
            <p className="loading">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="body">No meal slots yet. Add some in Manage.</p>
          ) : recipes.length === 0 ? (
            <p className="body">
              No recipes yet. <Link href="/recipes">Add a recipe</Link> to start
              planning meals.
            </p>
          ) : isToday ? (
            <div className="timeline">
              {slots.map((slot) => {
                const cards = cardsFor(slot);
                return (
                  <div key={slot.id} className="seg">
                    <span
                      className={cards.length ? "node" : "node node--empty"}
                      aria-hidden="true"
                    />
                    <p className="slot" style={{ marginBottom: 8 }}>
                      {slot.name}
                    </p>
                    {cards.length ? (
                      <div className="stack-sm">{cards}</div>
                    ) : (
                      <button
                        type="button"
                        className="btn-add"
                        onClick={() => openAdd(slot)}
                      >
                        + Add a meal
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="stack" style={{ gap: 22 }}>
              {slots.map((slot) => (
                <div key={slot.id} className="stack-sm">
                  <p className="slot">{slot.name}</p>
                  {cardsFor(slot)}
                  <button
                    type="button"
                    className="btn-add"
                    onClick={() => openAdd(slot)}
                  >
                    + Add a meal
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={addSlot !== null}
        title={addSlot ? `Add to ${addSlot.name}` : "Add a meal"}
        onClose={() => setAddSlot(null)}
      >
        <div className="sh-body">
          <div className="field">
            <span className="field-label">Recipe</span>
            <Dropdown
              label="Recipe"
              value={pickRecipe}
              options={recipes.map((r) => ({ id: r.id, label: r.name }))}
              onChange={(id) => setPickRecipe(Number(id))}
            />
          </div>
          <div className="servings-row">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Servings
            </span>
            <Stepper value={pickServings} min={1} onChange={setPickServings} />
          </div>

          <div className="servings-row">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Repeat
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={repeat}
              className={repeat ? "btn" : "btn-add"}
              onClick={() => setRepeat((v) => !v)}
            >
              {repeat ? "On" : "Off"}
            </button>
          </div>

          {repeat && (
            <>
              {unit === "week" && (
                <div className="week" role="group" aria-label="Repeat on">
                  {DOW.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={repeatDays[i]}
                      className={repeatDays[i] ? "day on" : "day"}
                      onClick={() =>
                        setRepeatDays((ds) => ds.map((d, j) => (j === i ? !d : d)))
                      }
                    >
                      <span className="dow">{label[0]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>
                  Every
                </span>
                <Stepper value={intervalN} min={1} onChange={setIntervalN} />
                <Dropdown
                  label="Unit"
                  value={unit}
                  options={[
                    { id: "week", label: intervalN > 1 ? "weeks" : "week" },
                    { id: "day", label: intervalN > 1 ? "days" : "day" },
                  ]}
                  onChange={(id) => setUnit(id === "day" ? "day" : "week")}
                />
              </div>
              <div className="field">
                <span className="field-label">Until (optional)</span>
                <input
                  type="date"
                  value={until}
                  min={selected}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
            </>
          )}

          <button
            type="button"
            className="btn block"
            onClick={saveMeal}
            disabled={
              saving ||
              pickRecipe == null ||
              (repeat && unit === "week" && !repeatDays.some(Boolean))
            }
          >
            {saving ? "Adding…" : repeat ? "Add repeating meal" : "Add meal"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
