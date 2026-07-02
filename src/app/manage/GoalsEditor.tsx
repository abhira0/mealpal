"use client";

import { useEffect, useState } from "react";
import type { Goals } from "@/lib/nutrition";
import { CalorieMacroRing } from "@/components/CalorieMacroRing";

// Daily calorie/macro goals form for /manage/goals; auto-saves via /api/nutrition/goals.
export function GoalsEditor() {
  const [form, setForm] = useState<Goals | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/goals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setForm)
      .catch(() => setForm(null));
  }, []);

  // Debounced auto-save on any change.
  // ponytail: also fires once after the initial load, re-PUTting what was just
  // read — idempotent, cheaper than tracking a "dirty" flag.
  useEffect(() => {
    if (!form) return;
    const t = setTimeout(() => {
      fetch("/api/nutrition/goals", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [form]);

  if (!form) return <p style={{ opacity: 0.6 }}>Loading…</p>;

  const field = (key: keyof Goals, label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={0} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
    </label>
  );

  // Live preview: same ring as the nutrition page, fed by the goal targets.
  // Outer arc = calories your macro targets add up to vs the calorie goal.
  const macroCal = 4 * form.carbsG + 9 * form.fatG + 4 * form.proteinG;
  const pct = (x: number) => (macroCal > 0 ? (x / macroCal) * 100 : 0);

  return (
    <>
      {field("calorieGoal", "Calories")}
      {field("proteinG", "Protein (g)")}
      {field("carbsG", "Carbs (g)")}
      {field("fatG", "Fat (g)")}

      <p className="section-label">Calories &amp; macros</p>
      <CalorieMacroRing cal={macroCal} goal={form.calorieGoal}
        macros={{ carbs: pct(4 * form.carbsG), fat: pct(9 * form.fatG), protein: pct(4 * form.proteinG) }}
        n={form} />
      <p className="mono" style={{ textAlign: "center", margin: "-8px 0 0", fontSize: 12, color: "var(--sage)" }}>
        macro targets add up to {Math.round(macroCal)} of {form.calorieGoal} kcal
      </p>
    </>
  );
}
