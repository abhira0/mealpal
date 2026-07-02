"use client";

import { useEffect, useState } from "react";
import type { Goals } from "@/lib/nutrition";

// Daily calorie/macro goals editor; lives on Manage, saves via /api/nutrition/goals.
export function GoalsEditor() {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [form, setForm] = useState<Goals | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/goals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setGoals)
      .catch(() => setGoals(null));
  }, []);

  if (!form) {
    return (
      <>
        <p className="mono" style={{ fontSize: 12, color: "var(--sage)", margin: 0 }}>
          {goals
            ? `${goals.calorieGoal} kcal · ${goals.proteinG}g protein · ${goals.carbsG}g carbs · ${goals.fatG}g fat`
            : "Loading…"}
        </p>
        <button type="button" className="btn-link" style={{ alignSelf: "flex-start" }}
          disabled={!goals} onClick={() => setForm(goals)}>Edit goals</button>
      </>
    );
  }

  const field = (key: keyof Goals, label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={0} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
    </label>
  );

  const save = async () => {
    await fetch("/api/nutrition/goals", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setGoals(form);
    setForm(null);
  };

  return (
    <section className="stack">
      {field("calorieGoal", "Calories")}
      {field("proteinG", "Protein (g)")}
      {field("carbsG", "Carbs (g)")}
      {field("fatG", "Fat (g)")}
      <div className="filter">
        <button type="button" onClick={save}>Save</button>
        <button type="button" onClick={() => setForm(null)}>Cancel</button>
      </div>
    </section>
  );
}
