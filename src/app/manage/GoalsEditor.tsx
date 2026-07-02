"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Goals } from "@/lib/nutrition";

// Daily calorie/macro goals form for /manage/goals; saves via /api/nutrition/goals.
export function GoalsEditor() {
  const router = useRouter();
  const [form, setForm] = useState<Goals | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/goals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setForm)
      .catch(() => setForm(null));
  }, []);

  if (!form) return <p style={{ opacity: 0.6 }}>Loading…</p>;

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
    router.push("/manage");
  };

  return (
    <>
      {field("calorieGoal", "Calories")}
      {field("proteinG", "Protein (g)")}
      {field("carbsG", "Carbs (g)")}
      {field("fatG", "Fat (g)")}
      <div className="filter">
        <button type="button" onClick={save}>Save</button>
      </div>
    </>
  );
}
