"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
  shareToken: string | null;
  costCents: number | null;
  nutrition?: {
    perServing: FactValues;
    byIngredient: { ingredientId: number; name: string; unit: string; amount: number; values: FactValues }[];
    missing: string[];
    substituted: { ingredient: string; used: string }[];
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

function Chrome({ title }: { title: React.ReactNode }) {
  return (
    <PageHeader
      crumbs={[
        { label: "Manage", href: "/manage" },
        { label: "Recipes", href: "/recipes" },
      ]}
      title={title}
    />
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
  const [ytLoaded, setYtLoaded] = useState(false);
  const [seek, setSeek] = useState<{ start: number; end: number } | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

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
    setShareToken(r.shareToken);
  }

  async function toggleShare() {
    const enabled = !shareToken;
    const res = await fetch(`/api/recipes/${id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) setShareToken((await res.json()).token);
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
      <Chrome title="Recipe not found" />
    );
  }

  if (!recipe) {
    return (
      <Chrome title="Loading…" />
    );
  }

  const ratio = recipe.baseServings > 0 ? servings / recipe.baseServings : 1;
  const hasNutrition = !!recipe.nutrition && recipe.nutrition.perServing.calories != null;

  return (
    <>
      <Chrome title={recipe.name} />

      <div className="content stack">
        <Gallery
          ref={galleryRef}
          media={recipe.media}
          active={activeMedia}
          onSelect={setActiveMedia}
          title={recipe.name}
          loaded={ytLoaded}
          onLoad={() => setYtLoaded(true)}
          seek={seek}
        />

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
                {recipe.steps.map((s, i) => {
                  const hasClip =
                    recipe.media.some((m) => m.kind === "youtube") &&
                    s.startSeconds != null &&
                    s.endSeconds != null &&
                    s.endSeconds > s.startSeconds;
                  return (
                    <li
                      key={s.position ?? i}
                      className={`step${hasClip ? " step-clickable" : ""}`}
                      onClick={
                        hasClip
                          ? () => {
                              setSeek({ start: s.startSeconds!, end: s.endSeconds! });
                              setYtLoaded(true);
                              galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          : undefined
                      }
                    >
                      <span className="num" aria-hidden="true">{i + 1}</span>
                      <span className="step-text">{s.text}</span>
                      {hasClip && <span aria-hidden="true" style={{ marginLeft: 6, opacity: 0.6 }}>▶</span>}
                    </li>
                  );
                })}
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
            {recipe.nutrition!.substituted.length > 0 && (
              <p className="body" style={{ color: "var(--sage)", marginTop: 6 }}>
                {recipe.nutrition!.substituted.map((s) => `${s.ingredient}: preferred product has no label, using ${s.used}`).join("; ")}.
              </p>
            )}
          </section>
        )}

        {recipe.notes ? <p className="body" style={{ color: "var(--sage)" }}>{recipe.notes}</p> : null}

        <section className="stack">
          <div className="recipe-meta">
            <span className="title">Public link</span>
            <button type="button" className="btn" onClick={toggleShare}>
              {shareToken ? "Revoke" : "Share"}
            </button>
          </div>
          {shareToken && (
            <input
              className="input"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/r/${shareToken}`}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </section>

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
          recipe={recipe}
          videoId={youTubeId(recipe.media.find((m) => m.kind === "youtube")?.url ?? "")}
          onClose={() => setCooking(false)}
          onSaved={() => loadRecipe()}
        />
      )}
    </>
  );
}

function Gallery({
  ref,
  media,
  active,
  onSelect,
  title,
  loaded,
  onLoad,
  seek,
}: {
  ref?: React.Ref<HTMLDivElement>;
  media: Media[];
  active: number;
  onSelect: (i: number) => void;
  title: string;
  loaded: boolean;
  onLoad: () => void;
  seek: { start: number; end: number } | null;
}) {
  if (media.length === 0) return null;
  const current = media[Math.min(active, media.length - 1)];
  return (
    <div ref={ref} className="stack" style={{ gap: 8 }}>
      <MediaBlock media={current} title={title} loaded={loaded} onLoad={onLoad} seek={seek} />
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

function MediaBlock({
  media,
  title,
  loaded,
  onLoad,
  seek,
}: {
  media: Media;
  title: string;
  loaded: boolean;
  onLoad: () => void;
  seek: { start: number; end: number } | null;
}) {
  const yt = media.kind === "youtube" ? youTubeId(media.url) : null;
  if (media.kind === "youtube" && yt) {
    if (!loaded) {
      return (
        <button type="button" className="media yt-facade" onClick={onLoad} aria-label={`Play video: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" />
          <span className="yt-play" aria-hidden="true">▶</span>
        </button>
      );
    }
    const params = seek
      ? `?start=${seek.start}&end=${seek.end}&autoplay=1&rel=0`
      : "?autoplay=1&rel=0";
    return (
      <div className="media">
        <iframe
          key={seek ? `${seek.start}-${seek.end}` : "full"}
          src={`https://www.youtube.com/embed/${yt}${params}`}
          title={title}
          allow="autoplay; encrypted-media; fullscreen"
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
