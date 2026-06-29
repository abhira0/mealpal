"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QuantityChip } from "@/components/QuantityChip";
import { Stepper } from "@/components/Stepper";
import { RecipeSheet } from "@/components/RecipeSheet";

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
};

type Ingredient = {
  id: number;
  name: string;
  canonicalUnit: string;
};

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

        <button type="button" className="btn block" onClick={() => setEditOpen(true)}>
          Edit
        </button>
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
