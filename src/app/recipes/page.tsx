"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { Dropdown } from "@/components/Dropdown";

type Recipe = {
  id: number;
  name: string;
  baseServings: number;
  notes: string | null;
};

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

type DraftIngredient = { ingredientId: number | null; amount: string };

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function loadRecipes() {
    const res = await fetch("/api/recipes");
    if (res.ok) setRecipes(await res.json());
  }

  useEffect(() => {
    loadRecipes();
  }, []);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <>
      <header className="chrome">
        <p className="eb">Recipes · {recipes ? recipes.length : "…"}</p>
        <h1>Your recipes</h1>
      </header>

      <div className="content stack-sm">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="search" style={{ flex: 1 }}>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes"
              aria-label="Search recipes"
              className="input"
            />
          </div>
          <button type="button" className="btn" style={{ flex: "0 0 auto" }} onClick={() => setCreateOpen(true)}>
            + New recipe
          </button>
        </div>

        {recipes === null ? (
          <p className="loading">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty">
            {recipes.length === 0
              ? "No recipes yet — add one to start planning."
              : "No recipes match your search."}
          </p>
        ) : (
          filtered.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="row">
              <span className="row-link">
                <span className="thumb" aria-hidden="true" />
                <span className="row-main">
                  <span className="title" style={{ display: "block" }}>{r.name}</span>
                  <span className="meta">Serves {r.baseServings}</span>
                </span>
              </span>
              <span className="arrow" aria-hidden="true">›</span>
            </Link>
          ))
        )}      </div>

      <NewRecipeSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadRecipes();
        }}
      />
    </>
  );
}

function NewRecipeSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [baseServings, setBaseServings] = useState(2);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftIngredient[]>([
    { ingredientId: null, amount: "" },
  ]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/ingredients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Ingredient[]) => setIngredients(data))
      .catch(() => setIngredients([]));
  }, [open]);

  const ingredientOptions = ingredients.map((i) => ({ id: i.id, label: i.name }));

  function updateLine(idx: number, patch: Partial<DraftIngredient>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Please give the recipe a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      baseServings,
      notes: notes.trim() || null,
      ingredients: lines
        .filter((l) => l.ingredientId != null && l.amount.trim() !== "")
        .map((l) => ({
          ingredientId: l.ingredientId as number,
          amount: Number(l.amount) || 0,
        })),
      steps: steps.map((s) => s.trim()).filter(Boolean),
      media: [],
    };
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save the recipe. Please try again.");
      return;
    }
    setName("");
    setBaseServings(2);
    setNotes("");
    setLines([{ ingredientId: null, amount: "" }]);
    setSteps([""]);
    onCreated();
  }

  return (
    <Sheet open={open} title="New recipe" onClose={onClose}>
      <div className="sh-body">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunday Pancakes"
          />
        </label>

        <div className="servings-row">
          <span className="field-label" style={{ marginBottom: 0 }}>Base servings</span>
          <Stepper value={baseServings} min={1} onChange={setBaseServings} />
        </div>

        <div className="field">
          <span className="field-label">Ingredients</span>
          <div className="stack-sm">
            {lines.map((line, idx) => (
              <div key={idx} className="stack-sm" style={{ gap: 6 }}>
                <Dropdown
                  value={line.ingredientId}
                  options={ingredientOptions}
                  placeholder={
                    ingredients.length === 0 ? "No ingredients yet" : "Choose ingredient…"
                  }
                  onChange={(id) => updateLine(idx, { ingredientId: Number(id) })}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mono"
                  value={line.amount}
                  onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  placeholder="Amount (e.g. 300)"
                  aria-label="Amount"
                />
              </div>
            ))}
            <button
              type="button"
              className="trigger add"
              onClick={() => setLines((prev) => [...prev, { ingredientId: null, amount: "" }])}
            >
              + Add ingredient
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Steps</span>
          <div className="stack-sm">
            {steps.map((step, idx) => (
              <input
                key={idx}
                type="text"
                className="input"
                value={step}
                onChange={(e) =>
                  setSteps((prev) => prev.map((s, i) => (i === idx ? e.target.value : s)))
                }
                placeholder={`Step ${idx + 1}`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
            <button
              type="button"
              className="trigger add"
              onClick={() => setSteps((prev) => [...prev, ""])}
            >
              + Add step
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={2}
            style={{ resize: "vertical" }}
          />
        </label>

        {error ? <p className="notice">{error}</p> : null}

        <button type="button" className="btn block" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </Sheet>
  );
}
