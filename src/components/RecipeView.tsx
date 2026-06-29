"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QuantityChip } from "@/components/QuantityChip";
import { Stepper } from "@/components/Stepper";
import { RecipeSheet } from "@/components/RecipeSheet";
import { EditDeleteActions } from "@/components/EditDeleteActions";
import { NutritionFacts, type FactValues, FACT_ROWS } from "@/components/NutritionFacts";

type Media = { kind: string; url: string };
type RecipeIngredient = { ingredientId: number; amount: number };
type Step = { position: number; text: string };

type Recipe = {
  id: number;
  name: string;
  baseServings: number;
  notes: string | null;
  ingredients: RecipeIngredient[];
  steps: Step[];
  media: Media[];
  costCents: number | null;
  nutrition?: {
    perServing: FactValues;
    byIngredient: { ingredientId: number; name: string; values: FactValues }[];
    missing: string[];
  };
};

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

// Nutrient rows for the breakdown table: Calories + the standard label rows.
const NUTRIENT_ROWS = [{ key: "calories" as const, label: "Calories", unit: "" }, ...FACT_ROWS];

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function roundScaled(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <header className="chrome">
      <Link href="/recipes" className="chrome-back">
        ← Recipes
      </Link>
      {children}
    </header>
  );
}

export function RecipeView({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [servings, setServings] = useState(1);
  const [editOpen, setEditOpen] = useState(false);

  async function loadRecipe() {
    const rRes = await fetch(`/api/recipes/${id}`);
    if (rRes.status === 404 || !rRes.ok) {
      setNotFound(true);
      return;
    }
    const r: Recipe = await rRes.json();
    setRecipe(r);
    setServings(r.baseServings || 1);
  }

  useEffect(() => {
    loadRecipe();
    fetch("/api/ingredients").then((iRes) => {
      if (iRes.ok) iRes.json().then(setIngredients);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lookup = new Map(ingredients.map((i) => [i.id, i]));

  if (notFound) {
    return (
      <Chrome>
        <h1>Recipe not found</h1>
      </Chrome>
    );
  }

  if (!recipe) {
    return (
      <>
        <Chrome>
          <h1>Loading…</h1>
        </Chrome>
      </>
    );
  }

  const ratio = recipe.baseServings > 0 ? servings / recipe.baseServings : 1;
  const firstMedia = recipe.media[0];

  return (
    <>
      <Chrome>
        <h1>{recipe.name}</h1>
      </Chrome>

      <div className="content stack">
        <MediaBlock media={firstMedia} title={recipe.name} />

        <div className="servings-row">
          <span className="title">Servings</span>
          <Stepper value={servings} min={1} onChange={setServings} />
        </div>

        <section>
          <h2 className="title" style={{ marginBottom: 4 }}>
            Ingredients
            {recipe.costCents != null && recipe.baseServings > 0 ? (
              <span className="body" style={{ color: "var(--sage)", fontWeight: 400, float: "right" }}>
                ${(recipe.costCents / recipe.baseServings / 100).toFixed(2)} / meal
              </span>
            ) : null}
          </h2>
          {recipe.ingredients.map((line) => {
            const ing = lookup.get(line.ingredientId);
            const scaled = roundScaled(line.amount * ratio);
            const unit = ing?.canonicalUnit ?? "";
            const value = unit ? `${scaled} ${unit}` : scaled;
            return (
              <div key={line.ingredientId} className="ing-row">
                <span className="nm">
                  {ing?.name ?? `Ingredient #${line.ingredientId}`}
                </span>
                <QuantityChip value={value} />
              </div>
            );
          })}
        </section>

        {recipe.steps.length > 0 ? (
          <section>
            <h2 className="title" style={{ marginBottom: 4 }}>
              Steps
            </h2>
            <ol style={{ listStyle: "none" }}>
              {recipe.steps.map((s, i) => (
                <li key={s.position ?? i} className="step">
                  <span className="num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="step-text">{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {recipe.notes ? <p className="body" style={{ color: "var(--sage)" }}>{recipe.notes}</p> : null}

        {recipe.nutrition && recipe.nutrition.perServing.calories != null && (
          <section>
            <h2 className="title" style={{ marginBottom: 4 }}>Nutrition</h2>
            <NutritionFacts values={recipe.nutrition.perServing} servingLabel="1 serving" />

            <p className="section-label" style={{ marginTop: 12 }}>Per-serving breakdown by ingredient</p>
            <div style={{ overflowX: "auto" }}>
              <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>Nutrient</th>
                    {recipe.nutrition.byIngredient.map((ing) => (
                      <th key={ing.ingredientId} style={{ textAlign: "right", padding: "6px 8px" }}>{ing.name}</th>
                    ))}
                    <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {NUTRIENT_ROWS.map((row) => (
                    <tr key={row.key} style={{ borderTop: "1px solid var(--line, #0001)" }}>
                      <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>
                        {row.label}{row.unit ? ` (${row.unit})` : ""}
                      </th>
                      {recipe.nutrition!.byIngredient.map((ing) => (
                        <td key={ing.ingredientId} style={{ textAlign: "right", padding: "6px 8px" }}>
                          {ing.values[row.key] != null ? Math.round(ing.values[row.key]!) : "—"}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>
                        {recipe.nutrition!.perServing[row.key] != null ? Math.round(recipe.nutrition!.perServing[row.key]!) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {recipe.nutrition.missing.length > 0 && (
              <p className="body" style={{ color: "var(--sage)", marginTop: 6 }}>
                Missing nutrition for: {recipe.nutrition.missing.join(", ")} — totals may be low.
              </p>
            )}
          </section>
        )}

        <EditDeleteActions
          singular="recipe"
          deletePath={`/api/recipes/${id}`}
          backHref="/recipes"
          onEdit={() => setEditOpen(true)}
        />
      </div>

      <RecipeSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        recipe={recipe}
        onSaved={() => {
          setEditOpen(false);
          loadRecipe();
        }}
      />
    </>
  );
}

function MediaBlock({ media, title }: { media: Media | undefined; title: string }) {
  if (!media) {
    return <div className="media" aria-hidden="true" />;
  }

  const yt = media.kind === "youtube" ? youTubeId(media.url) : null;
  if (media.kind === "youtube" && yt) {
    return (
      <div className="media">
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          title={title}
          allowFullScreen
        />
      </div>
    );
  }

  if (media.kind === "video") {
    return (
      <div className="media">
        <video src={media.url} controls />
      </div>
    );
  }

  return (
    <div className="media">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.url} alt={title} />
    </div>
  );
}
