"use client";

import { useCallback, useEffect, useState } from "react";
import { MealCard } from "@/components/MealCard";

type Slot = { id: number; name: string; position: number };
type Recipe = { id: number; name: string; baseServings: number };
type Event = {
  id: number;
  date: string;
  slotId: number;
  recipeId: number;
  servings: number;
  status: string;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlanEditor() {
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadStatic = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        fetch("/api/slots").then((x) => x.json()),
        fetch("/api/recipes").then((x) => x.json()),
      ]);
      setSlots(Array.isArray(s) ? s : []);
      setRecipes(Array.isArray(r) ? r : []);
    } catch {
      setError("Could not load slots or recipes.");
    }
  }, []);

  const loadEvents = useCallback(async (d: string) => {
    try {
      const e = await fetch(`/api/events?from=${d}&to=${d}`).then((x) => x.json());
      setEvents(Array.isArray(e) ? e : []);
    } catch {
      setError("Could not load meals.");
    }
  }, []);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);
  useEffect(() => {
    loadEvents(date);
  }, [date, loadEvents]);

  const recipeName = new Map(recipes.map((r) => [r.id, r.name]));

  async function addMeal(slotId: number, recipeId: number, servings: number) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, slotId, recipeId, servings }),
    });
    if (res.ok) loadEvents(date);
  }

  async function cook(eventId: number) {
    const res = await fetch(`/api/events/${eventId}/cook`, { method: "POST" });
    if (res.ok) loadEvents(date);
  }

  return (
    <main className="app-main">
      <div className="page-header">
        <p className="eyebrow">Plan</p>
        <h1>Build the week</h1>
      </div>

      <div className="field">
        <label htmlFor="plan-date">Date</label>
        <input
          id="plan-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stack" style={{ marginTop: 8 }}>
        {slots.map((slot) => {
          const slotEvents = events.filter((e) => e.slotId === slot.id);
          return (
            <section key={slot.id}>
              <div className="slot-label">{slot.name}</div>
              <div className="stack">
                {slotEvents.map((ev) => (
                  <MealCard
                    key={ev.id}
                    title={recipeName.get(ev.recipeId) ?? "Recipe"}
                    servings={ev.servings}
                    recipeId={ev.recipeId}
                    status={ev.status}
                    onCook={() => cook(ev.id)}
                  />
                ))}
                <AddMealForm
                  slotId={slot.id}
                  recipes={recipes}
                  onAdd={addMeal}
                />
              </div>
            </section>
          );
        })}
        {slots.length === 0 && !error && (
          <p className="caption">No slots yet. Add some on the Manage screen.</p>
        )}
      </div>
    </main>
  );
}

function AddMealForm({
  slotId,
  recipes,
  onAdd,
}: {
  slotId: number;
  recipes: Recipe[];
  onAdd: (slotId: number, recipeId: number, servings: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState("2");

  if (recipes.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        + Add a meal
      </button>
    );
  }

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!recipeId) return;
        onAdd(slotId, Number(recipeId), Number(servings) || 1);
        setOpen(false);
        setRecipeId("");
      }}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Recipe</label>
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required>
          <option value="">Choose a recipe…</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Servings</label>
        <input
          type="number"
          min="1"
          inputMode="numeric"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
        />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm">
          Add
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
