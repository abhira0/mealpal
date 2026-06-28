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
  servingSize: number | null;
};

type DraftIngredient = { ingredientId: number | null; amount: string };

const fieldStyle: React.CSSProperties = {
  background: "var(--paper-raised)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "11px 13px",
  fontSize: 14,
  fontFamily: "var(--body)",
  fontWeight: 600,
  width: "100%",
  minHeight: 44,
  color: "var(--ink)",
};

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
    <main>
      <div className="chrome">
        <p className="eb">Recipes · {recipes ? recipes.length : "…"}</p>
        <h1>Your recipes</h1>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--sage)",
              fontSize: 14,
            }}
          >
            ⌕
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes"
            aria-label="Search recipes"
            className="search"
            style={{ ...fieldStyle, paddingLeft: 36 }}
          />
        </div>

        {recipes === null ? (
          <p className="slot">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="slot" style={{ padding: "8px 2px" }}>
            {recipes.length === 0
              ? "No recipes yet — add one to start planning."
              : "No recipes match your search."}
          </p>
        ) : (
          filtered.map((r) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              style={{ textDecoration: "none", color: "var(--ink)" }}
            >
              <div
                className="card"
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background:
                      "linear-gradient(135deg, var(--enamel), var(--enamel-dark))",
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="title">{r.name}</div>
                  <p
                    className="slot"
                    style={{ marginTop: 4, color: "var(--sage)" }}
                  >
                    Serves {r.baseServings}
                  </p>
                </div>
                <span aria-hidden="true" style={{ color: "var(--sage)" }}>
                  ›
                </span>
              </div>
            </Link>
          ))
        )}

        <button
          type="button"
          className="btn"
          onClick={() => setCreateOpen(true)}
        >
          + New recipe
        </button>
      </div>

      <NewRecipeSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadRecipes();
        }}
      />
    </main>
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
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
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
    // reset
    setName("");
    setBaseServings(2);
    setNotes("");
    setLines([{ ingredientId: null, amount: "" }]);
    setSteps([""]);
    onCreated();
  }

  return (
    <Sheet open={open} title="New recipe" onClose={onClose}>
      <div style={{ padding: "4px 18px 0", display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="slot">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunday Pancakes"
            style={fieldStyle}
          />
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="slot">Base servings</span>
          <Stepper value={baseServings} min={1} onChange={setBaseServings} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span className="slot">Ingredients</span>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: "grid", gap: 6 }}>
              <Dropdown
                value={line.ingredientId}
                options={ingredientOptions}
                placeholder={
                  ingredients.length === 0
                    ? "No ingredients yet"
                    : "Choose ingredient…"
                }
                onChange={(id) => updateLine(idx, { ingredientId: Number(id) })}
              />
              <input
                type="text"
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => updateLine(idx, { amount: e.target.value })}
                placeholder="Amount (e.g. 300)"
                aria-label="Amount"
                style={{ ...fieldStyle, fontFamily: "var(--mono)" }}
              />
            </div>
          ))}
          <button
            type="button"
            className="trigger"
            style={{ justifyContent: "center", color: "var(--enamel)" }}
            onClick={() =>
              setLines((prev) => [...prev, { ingredientId: null, amount: "" }])
            }
          >
            + Add ingredient
          </button>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span className="slot">Steps</span>
          {steps.map((step, idx) => (
            <input
              key={idx}
              type="text"
              value={step}
              onChange={(e) =>
                setSteps((prev) =>
                  prev.map((s, i) => (i === idx ? e.target.value : s)),
                )
              }
              placeholder={`Step ${idx + 1}`}
              aria-label={`Step ${idx + 1}`}
              style={fieldStyle}
            />
          ))}
          <button
            type="button"
            className="trigger"
            style={{ justifyContent: "center", color: "var(--enamel)" }}
            onClick={() => setSteps((prev) => [...prev, ""])}
          >
            + Add step
          </button>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="slot">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={2}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        {error ? (
          <p className="slot" style={{ color: "var(--run-ink)" }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={submit}
          style={{ marginBottom: 4 }}
        >
          {saving ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </Sheet>
  );
}
