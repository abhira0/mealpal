import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { listIngredients } from "@/lib/ingredients";
import { QuantityChip } from "@/components/QuantityChip";
import { formatQty, formatServings } from "@/lib/units";

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export default async function RecipeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const hid = session.user.householdId;
  const { id } = await params;

  const recipe = getRecipe(db, hid, Number(id));
  if (!recipe) notFound();

  const ingredients = listIngredients(db, hid);
  const lookup = new Map(ingredients.map((i) => [i.id, i]));

  return (
    <main className="app-main">
      <div className="page-header">
        <div className="row-between">
          <p className="eyebrow">Recipe</p>
          <Link href="/recipes" style={{ color: "var(--paper)", opacity: 0.85 }}>
            ← All recipes
          </Link>
        </div>
        <h1>{recipe.name}</h1>
        <div style={{ marginTop: 12 }}>
          <QuantityChip value={formatServings(recipe.baseServings)} />
        </div>
      </div>

      {recipe.media.length > 0 && (
        <div className="stack" style={{ marginBottom: 20 }}>
          {recipe.media.map((m, i) => {
            const yt = youTubeId(m.url);
            if (yt) {
              return (
                <div
                  key={i}
                  style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: "var(--radius)", overflow: "hidden" }}
                >
                  <iframe
                    src={`https://www.youtube.com/embed/${yt}`}
                    title={`${recipe.name} video ${i + 1}`}
                    allowFullScreen
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  />
                </div>
              );
            }
            if (m.kind === "video") {
              return (
                <video key={i} src={m.url} controls style={{ width: "100%", borderRadius: "var(--radius)" }} />
              );
            }
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={m.url} alt={recipe.name} style={{ width: "100%", borderRadius: "var(--radius)" }} />;
          })}
        </div>
      )}

      {recipe.notes && (
        <p className="caption" style={{ marginBottom: 20 }}>
          {recipe.notes}
        </p>
      )}

      <h2 style={{ marginBottom: 12 }}>Ingredients</h2>
      <div className="stack" style={{ marginBottom: 24 }}>
        {recipe.ingredients.map((line) => {
          const ing = lookup.get(line.ingredientId);
          return (
            <div className="row-between" key={line.ingredientId}>
              <span>{ing?.name ?? `Ingredient #${line.ingredientId}`}</span>
              <QuantityChip value={formatQty(line.amount, ing?.canonicalUnit ?? "")} />
            </div>
          );
        })}
      </div>

      <h2 style={{ marginBottom: 12 }}>Steps</h2>
      <ol style={{ paddingLeft: 0, listStyle: "none", display: "grid", gap: 14 }}>
        {recipe.steps.map((s, i) => (
          <li key={s.position ?? i} className="row" style={{ alignItems: "flex-start" }}>
            <span
              className="mono"
              style={{
                flex: "0 0 28px",
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--enamel)",
                color: "var(--paper)",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {i + 1}
            </span>
            <span style={{ paddingTop: 3 }}>{s.text}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
