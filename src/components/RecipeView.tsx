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
  servingSize: number | null;
};

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Round to at most 2 decimals, dropping trailing zeros. */
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

export function RecipeView({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [servings, setServings] = useState(1);
  const [cook, setCook] = useState<CookState>("idle");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/recipes/${id}`),
      fetch("/api/ingredients"),
    ]).then(async ([rRes, iRes]) => {
      if (!active) return;
      if (rRes.status === 404 || !rRes.ok) {
        setNotFound(true);
        return;
      }
      const r: Recipe = await rRes.json();
      setRecipe(r);
      setServings(r.baseServings || 1);
      if (iRes.ok) setIngredients(await iRes.json());
    });
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
      const cookRes = await fetch(`/api/events/${event.id}/cook`, {
        method: "POST",
      });
      setCook(cookRes.ok ? "done" : "error");
    } catch {
      setCook("error");
    }
  }

  if (notFound) {
    return (
      <main>
        <div className="chrome">
          <Link href="/recipes" className="eb" style={{ display: "inline-block" }}>
            ← Recipes
          </Link>
          <h1>Recipe not found</h1>
        </div>
      </main>
    );
  }

  if (!recipe) {
    return (
      <main>
        <div className="chrome">
          <Link href="/recipes" className="eb" style={{ display: "inline-block" }}>
            ← Recipes
          </Link>
          <h1>Loading…</h1>
        </div>
      </main>
    );
  }

  const ratio = recipe.baseServings > 0 ? servings / recipe.baseServings : 1;
  const firstMedia = recipe.media[0];

  return (
    <main>
      <div className="chrome">
        <Link href="/recipes" className="eb" style={{ display: "inline-block" }}>
          ← Recipes
        </Link>
        <h1>{recipe.name}</h1>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 18 }}>
        {/* Media block */}
        <MediaBlock media={firstMedia} title={recipe.name} />

        {/* Serving stepper */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="title">Servings</span>
          <Stepper value={servings} min={1} onChange={setServings} />
        </div>

        {/* Ingredients */}
        <section>
          <h2 className="title" style={{ marginBottom: 8 }}>
            Ingredients
          </h2>
          <div>
            {recipe.ingredients.map((line) => {
              const ing = lookup.get(line.ingredientId);
              const scaled = roundScaled(line.amount * ratio);
              const unit = ing?.canonicalUnit ?? "";
              const value = unit ? `${scaled} ${unit}` : scaled;
              return (
                <div
                  key={line.ingredientId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "11px 0",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {ing?.name ?? `Ingredient #${line.ingredientId}`}
                  </span>
                  <QuantityChip value={value} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Steps */}
        {recipe.steps.length > 0 ? (
          <section>
            <h2 className="title" style={{ marginBottom: 8 }}>
              Steps
            </h2>
            <ol
              style={{
                listStyle: "none",
                display: "grid",
                gap: 14,
                padding: 0,
              }}
            >
              {recipe.steps.map((s, i) => (
                <li
                  key={s.position ?? i}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <span
                    className="num"
                    aria-hidden="true"
                    style={{
                      flex: "none",
                      width: 26,
                      height: 26,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--enamel)",
                      color: "var(--paper)",
                      borderRadius: 6,
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ paddingTop: 3 }}>{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {recipe.notes ? (
          <p className="slot" style={{ color: "var(--sage)" }}>
            {recipe.notes}
          </p>
        ) : null}

        {/* Cook it */}
        <button
          type="button"
          className="btn"
          disabled={cook === "working" || cook === "done"}
          onClick={cookIt}
          style={{ marginTop: 4 }}
        >
          {cook === "working"
            ? "Logging…"
            : cook === "done"
              ? "✓ Cooked · logged to today"
              : "Cook it · logs to today"}
        </button>
        {cook === "error" ? (
          <p className="slot" style={{ color: "var(--run-ink)" }}>
            Couldn&apos;t log this — make sure you have a meal slot set up.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function MediaBlock({ media, title }: { media: Media | undefined; title: string }) {
  if (!media) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          height: 180,
          borderRadius: 8,
          background:
            "linear-gradient(135deg, var(--enamel), var(--enamel-dark))",
        }}
      />
    );
  }

  const yt = media.kind === "youtube" ? youTubeId(media.url) : null;
  if (media.kind === "youtube" && yt) {
    return (
      <div
        style={{
          position: "relative",
          paddingBottom: "56.25%",
          height: 0,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          title={title}
          allowFullScreen
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
          }}
        />
      </div>
    );
  }

  if (media.kind === "video") {
    return (
      <video
        src={media.url}
        controls
        style={{ width: "100%", borderRadius: 8, display: "block" }}
      />
    );
  }

  // photo (or unknown) → image
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={media.url}
      alt={title}
      style={{ width: "100%", borderRadius: 8, display: "block" }}
    />
  );
}
