"use client";

import { useEffect, useRef, useState } from "react";
import type { Goals } from "@/lib/nutrition";
import { CalorieMacroRing } from "@/components/CalorieMacroRing";

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Daily calorie/macro goals form for /manage/goals; auto-saves via /api/nutrition/goals.
export function GoalsEditor() {
  const [form, setForm] = useState<Goals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Snapshot (JSON) of the values as last loaded/saved. Comparing against it —
  // rather than a plain "have we run once" flag — also survives dev/StrictMode's
  // double-invoked effects, which would otherwise desync a simple boolean.
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/goals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Goals | null) => {
        setForm(data);
        if (data) loadedRef.current = JSON.stringify(data);
      })
      .catch(() => setForm(null));
  }, []);

  // Debounced auto-save on any change. Skip when `form` matches the loaded/last
  // saved snapshot, so mounting doesn't re-PUT the values it just read.
  useEffect(() => {
    if (!form) return;
    if (JSON.stringify(form) === loadedRef.current) return;
    setStatus("saving");
    const t = setTimeout(() => {
      fetch("/api/nutrition/goals", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
        .then((r) => {
          if (r.ok) {
            loadedRef.current = JSON.stringify(form);
            setError(null);
            setStatus("saved");
          } else {
            setError("Couldn't save — check your goal values.");
            setStatus("error");
          }
        })
        .catch(() => {
          setError("Couldn't save — check your connection.");
          setStatus("error");
        });
    }, 500);
    return () => clearTimeout(t);
  }, [form]);

  // Auto-clear the "Saved" pill after a few seconds.
  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 3000);
    return () => clearTimeout(t);
  }, [status]);

  if (!form) return <p style={{ opacity: 0.6 }}>Loading…</p>;

  // Number inputs let a user type "-" or clear the box entirely; `min` only
  // affects the spinner/native validity, not what the keystroke produces. A
  // negative or non-finite goal would sail past the field, break the ring's
  // percentages, and get rejected by the API with no visible feedback — so
  // clamp to a non-negative integer here, at the one place values enter state.
  const field = (key: keyof Goals, label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={0} value={form[key]}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          setForm({ ...form, [key]: Number.isFinite(n) ? Math.max(0, n) : 0 });
        }} />
    </label>
  );

  // Live preview: same ring as the nutrition page, fed by the goal targets.
  // Outer arc = calories your macro targets add up to vs the calorie goal.
  const macroCal = 4 * form.carbsG + 9 * form.fatG + 4 * form.proteinG;
  const pct = (x: number) => (macroCal > 0 ? (x / macroCal) * 100 : 0);

  return (
    <>
      {status === "saving" && <p className="mono" data-testid="save-status">Saving…</p>}
      {status === "saved" && <p className="mono" data-testid="save-status">Saved</p>}
      {error && <p className="notice" role="alert">{error}</p>}
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
