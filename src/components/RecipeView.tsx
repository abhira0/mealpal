"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QuantityChip } from "@/components/QuantityChip";
import { Stepper } from "@/components/Stepper";

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

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type CookState = "idle" | "working" | "done" | "error";

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
  const [cook, setCook] = useState<CookState>("idle");

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/recipes/${id}`), fetch("/api/ingredients")]).then(
      async ([rRes, iRes]) => {
        if (!active) return;
        if (rRes.status === 404 || !rRes.ok) {
          setNotFound(true);
          return;
        }
        const r: Recipe = await rRes.json();
        setRecipe(r);
        setServings(r.baseServings || 1);
        if (iRes.ok) setIngredients(await iRes.json());
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  const lookup = new Map(ingredients.map((i) => [i.id, i]));

  async function cookIt() {
    if (!recipe) return;
    setCook("working");
    try {
      const slotsRes = await fetch("/api/slots");
      const slots: { id: number }[] = slotsRes.ok ? await slotsRes.json() : [];
      if (slots.length === 0) {
        setCook("error");
        return;
      }
      const evRes = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayISO(),
          slotId: slots[0].id,
          recipeId: recipe.id,
          servings,
        }),
      });
      if (!evRes.ok) {
        setCook("error");
        return;
      }
      const event: { id: number } = await evRes.json();
      const cookRes = await fetch(`/api/events/${event.id}/cook`, { method: "POST" });
      setCook(cookRes.ok ? "done" : "error");
    } catch {
      setCook("error");
    }
  }

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

        <button
          type="button"
          className="btn block"
          disabled={cook === "working" || cook === "done"}
          onClick={cookIt}
        >
          {cook === "working"
            ? "Logging…"
            : cook === "done"
              ? "✓ Cooked · logged to today"
              : "Cook it · logs to today"}
        </button>
        {cook === "error" ? (
          <p className="notice">
            Couldn&apos;t log this — make sure you have a meal slot set up.
          </p>
        ) : null}
      </div>
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
