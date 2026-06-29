"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QuantityChip } from "@/components/QuantityChip";
import { Stepper } from "@/components/Stepper";
import { RecipeSheet } from "@/components/RecipeSheet";
import { CookMode } from "@/components/CookMode";
import { EditDeleteActions } from "@/components/EditDeleteActions";
import { NutritionFacts, type FactValues, FACT_ROWS } from "@/components/NutritionFacts";

type Media = { kind: string; url: string };
type RecipeIngredient = { ingredientId: number; amount: number };
type Step = { position: number; text: string; startSeconds: number | null; endSeconds: number | null };

type Recipe = {
  id: number;
  name: string;
  baseServings: number;
  totalMinutes: number | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
  steps: Step[];
  media: Media[];
  costCents: number | null;
  nutrition?: {
    perServing: FactValues;
    byIngredient: { ingredientId: number; name: string; unit: string; amount: number; values: FactValues }[];
    missing: string[];
  };
};

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

type Tab = "ingredients" | "steps" | "nutrition";

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
  const [cooking, setCooking] = useState(false);
  const [tab, setTab] = useState<Tab>("ingredients");
  const [activeMedia, setActiveMedia] = useState(0);
  const [nutriTab, setNutriTab] = useState<"label" | "breakdown">("label");

  async function loadRecipe() {
    const rRes = await fetch(`/api/recipes/${id}`);
    if (rRes.status === 404 || !rRes.ok) {
      setNotFound(true);
      return;
    }
    const r: Recipe = await rRes.json();
    setRecipe(r);
    setServings(r.baseServings || 1);
    setActiveMedia(0);
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
      <Chrome>
        <h1>Loading…</h1>
      </Chrome>
    );
  }

  const ratio = recipe.baseServings > 0 ? servings / recipe.baseServings : 1;
  const hasNutrition = !!recipe.nutrition && recipe.nutrition.perServing.calories != null;

  return (
    <>
      <Chrome>
        <h1>{recipe.name}</h1>
      </Chrome>

      <div className="content stack">
        <Gallery media={recipe.media} active={activeMedia} onSelect={setActiveMedia} title={recipe.name} />

        <div className="recipe-meta">
          <span className="body">
            {recipe.totalMinutes ? `${recipe.totalMinutes} min · ` : ""}
            {recipe.baseServings} {recipe.baseServings === 1 ? "serving" : "servings"}
          </span>
          {recipe.steps.length > 0 && (
            <button type="button" className="btn cook-btn" onClick={() => setCooking(true)}>
              ⛶ Cook
            </button>
          )}
        </div>

        <div className="tabs" role="tablist">
          <button type="button" aria-pressed={tab === "ingredients"} onClick={() => setTab("ingredients")}>
            Ingredients
          </button>
          <button type="button" aria-pressed={tab === "steps"} onClick={() => setTab("steps")}>
            Steps
          </button>
          {hasNutrition && (
            <button type="button" aria-pressed={tab === "nutrition"} onClick={() => setTab("nutrition")}>
              Nutrition
            </button>
          )}
        </div>

        {tab === "ingredients" && (
          <section>
            <div className="servings-row" style={{ marginBottom: 10 }}>
              <span className="title">Servings</span>
              <Stepper value={servings} min={1} onChange={setServings} />
            </div>
            {recipe.costCents != null && recipe.baseServings > 0 && (
              <p className="body" style={{ color: "var(--enamel)", fontFamily: "var(--mono)", marginBottom: 8 }}>
                ${(recipe.costCents / recipe.baseServings / 100).toFixed(2)} / meal
              </p>
            )}
            {recipe.ingredients.map((line) => {
              const ing = lookup.get(line.ingredientId);
              const scaled = roundScaled(line.amount * ratio);
              const unit = ing?.canonicalUnit ?? "";
              const value = unit ? `${scaled} ${unit}` : scaled;
              return (
                <div key={line.ingredientId} className="ing-row">
                  <span className="nm">{ing?.name ?? `Ingredient #${line.ingredientId}`}</span>
                  <QuantityChip value={value} />
                </div>
              );
            })}
          </section>
        )}

        {tab === "steps" && (
          <section>
            {recipe.steps.length > 0 ? (
              <ol style={{ listStyle: "none" }}>
                {recipe.steps.map((s, i) => (
                  <li key={s.position ?? i} className="step">
                    <span className="num" aria-hidden="true">{i + 1}</span>
                    <span className="step-text">{s.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="body" style={{ color: "var(--sage)" }}>No steps yet.</p>
            )}
          </section>
        )}

        {tab === "nutrition" && hasNutrition && (
          <section>
            <div className="filter" style={{ marginBottom: 8 }}>
              <button type="button" aria-pressed={nutriTab === "label"} onClick={() => setNutriTab("label")}>Label</button>
              <button type="button" aria-pressed={nutriTab === "breakdown"} onClick={() => setNutriTab("breakdown")}>Breakdown</button>
            </div>

            {nutriTab === "label" ? (
              <NutritionFacts values={recipe.nutrition!.perServing} servingLabel="1 serving" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>Nutrient</th>
                      {recipe.nutrition!.byIngredient.map((ing) => (
                        <th key={ing.ingredientId} style={{ textAlign: "right", padding: "6px 8px" }}>{ing.name}</th>
                      ))}
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid var(--line, #0001)" }}>
                      <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "6px 10px 6px 0", position: "sticky", left: 0, background: "var(--paper)" }}>Qty</th>
                      {recipe.nutrition!.byIngredient.map((ing) => (
                        <td key={ing.ingredientId} style={{ textAlign: "right", padding: "6px 8px", opacity: 0.6 }}>
                          {roundScaled(ing.amount)}{ing.unit}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", padding: "6px 8px" }}>—</td>
                    </tr>
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
            )}

            {recipe.nutrition!.missing.length > 0 && (
              <p className="body" style={{ color: "var(--sage)", marginTop: 6 }}>
                Missing nutrition for: {recipe.nutrition!.missing.join(", ")} — totals may be low.
              </p>
            )}
          </section>
        )}

        {recipe.notes ? <p className="body" style={{ color: "var(--sage)" }}>{recipe.notes}</p> : null}

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

      {cooking && (
        <CookMode
          steps={recipe.steps}
          title={recipe.name}
          videoId={youTubeId(recipe.media.find((m) => m.kind === "youtube")?.url ?? "")}
          onClose={() => setCooking(false)}
        />
      )}
    </>
  );
}

function Gallery({
  media,
  active,
  onSelect,
  title,
}: {
  media: Media[];
  active: number;
  onSelect: (i: number) => void;
  title: string;
}) {
  if (media.length === 0) return <div className="media" aria-hidden="true" />;
  const current = media[Math.min(active, media.length - 1)];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <MediaBlock media={current} title={title} />
      {media.length > 1 && (
        <div className="gallery-strip">
          {media.map((m, i) => (
            <button
              key={i}
              type="button"
              className={`gallery-thumb${i === active ? " on" : ""}`}
              aria-label={`Media ${i + 1}`}
              aria-pressed={i === active}
              onClick={() => onSelect(i)}
            >
              {m.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" />
              ) : (
                <span aria-hidden="true">▶</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaBlock({ media, title }: { media: Media; title: string }) {
  const yt = media.kind === "youtube" ? youTubeId(media.url) : null;
  if (media.kind === "youtube" && yt) {
    return (
      <div className="media">
        <iframe src={`https://www.youtube.com/embed/${yt}`} title={title} allowFullScreen />
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
