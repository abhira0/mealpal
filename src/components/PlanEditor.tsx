"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { MealCard } from "@/components/MealCard";

type Slot = { id: number; name: string; position: number };
type Recipe = { id: number; name: string; baseServings: number };
type MealEvent = {
  id: number;
  date: string;
  slotId: number;
  recipeId: number;
  servings: number;
  status: string;
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

export function PlanEditor() {
  const days = useMemo(weekDays, []);
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

  const month = new Date(selected + "T00:00:00")
    .toLocaleDateString(undefined, { month: "long" })
    .toUpperCase();

  function openAdd(slot: Slot) {
    setAddSlot(slot);
    setPickRecipe(recipes[0]?.id ?? null);
    setPickServings(recipes[0]?.baseServings ?? 2);
  }

  async function saveMeal() {
    if (!addSlot || pickRecipe == null || saving) return;
    setSaving(true);
    const res = await fetch("/api/events", {
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
    <main className="app">
      <header className="chrome">
        <p className="eb">Plan · {month}</p>
        <h1>This week</h1>
      </header>

      <div style={{ padding: 16 }}>
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
                style={{ cursor: "pointer" }}
              >
                <span
                  className="slot"
                  style={{
                    color: on ? "var(--paper)" : "var(--sage)",
                    display: "block",
                  }}
                >
                  {DOW[d.getDay()]}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    fontSize: 16,
                    display: "block",
                    marginTop: 2,
                  }}
                >
                  {d.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    width: 5,
                    height: 5,
                    margin: "4px auto 0",
                    borderRadius: "50%",
                    background: hasMeals
                      ? on
                        ? "var(--paprika-soft)"
                        : "var(--paprika)"
                      : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 22 }}>
          {loading ? (
            <p className="slot">Loading…</p>
          ) : slots.length === 0 ? (
            <p style={{ fontSize: 14 }}>No meal slots yet. Add some in Manage.</p>
          ) : (
            slots.map((slot) => {
              const slotEvents = events.filter(
                (e) => e.date === selected && e.slotId === slot.id,
              );
              return (
                <div key={slot.id} style={{ marginBottom: 22 }}>
                  <p className="slot" style={{ marginBottom: 8 }}>
                    {slot.name}
                  </p>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    {slotEvents.map((ev) => (
                      <MealCard
                        key={ev.id}
                        eventId={ev.id}
                        title={recipeName.get(ev.recipeId) ?? "Recipe"}
                        servings={ev.servings}
                        recipeId={ev.recipeId}
                        status={ev.status}
                        onCooked={loadEvents}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => openAdd(slot)}
                      disabled={recipes.length === 0}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: recipes.length === 0 ? "default" : "pointer",
                        color: "var(--enamel)",
                        fontFamily: "var(--body)",
                        fontWeight: 600,
                        fontSize: 14,
                        opacity: recipes.length === 0 ? 0.5 : 1,
                      }}
                    >
                      + Add a meal
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Sheet
        open={addSlot !== null}
        title={addSlot ? `Add to ${addSlot.name}` : "Add a meal"}
        onClose={() => setAddSlot(null)}
      >
        <div
          style={{
            padding: "8px 18px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <p className="slot" style={{ marginBottom: 6 }}>
              Recipe
            </p>
            <Dropdown
              label="Recipe"
              value={pickRecipe}
              options={recipes.map((r) => ({ id: r.id, label: r.name }))}
              onChange={(id) => setPickRecipe(Number(id))}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <p className="slot">Servings</p>
            <Stepper value={pickServings} min={1} onChange={setPickServings} />
          </div>
          <button
            type="button"
            className="btn"
            onClick={saveMeal}
            disabled={saving || pickRecipe == null}
            style={{ width: "100%" }}
          >
            {saving ? "Adding…" : "Add meal"}
          </button>
        </div>
      </Sheet>
    </main>
  );
}
