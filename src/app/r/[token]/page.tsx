import { notFound } from "next/navigation";
import { db } from "@/db";
import { getPublicRecipe } from "@/lib/recipes";
import { PublicCookButton } from "@/components/PublicCookButton";

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function round(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export default async function PublicRecipePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recipe = getPublicRecipe(db, token);
  if (!recipe) notFound();

  return (
    <div className="content stack">
      <h1 className="title">{recipe.name}</h1>
      <div className="recipe-meta">
        <span className="body" style={{ color: "var(--sage)" }}>
          {recipe.totalMinutes ? `${recipe.totalMinutes} min · ` : ""}
          {recipe.baseServings} {recipe.baseServings === 1 ? "serving" : "servings"}
        </span>
        <PublicCookButton
          recipe={{
            id: 0,
            name: recipe.name,
            baseServings: recipe.baseServings,
            notes: recipe.notes,
            ingredients: recipe.ingredients.map((i) => ({ ingredientId: i.ingredientId, amount: i.amount })),
            steps: recipe.steps,
          }}
        />
      </div>

      {recipe.media.map((m, i) => {
        const yt = m.kind === "youtube" ? youTubeId(m.url) : null;
        if (yt) {
          return (
            <iframe
              key={i}
              className="media"
              src={`https://www.youtube.com/embed/${yt}`}
              title={recipe.name}
              allowFullScreen
            />
          );
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} className="media" src={m.url} alt={recipe.name} />;
      })}

      <section>
        <h2 className="title">Ingredients</h2>
        {recipe.ingredients.map((line) => (
          <div key={line.ingredientId} className="ing-row">
            <span className="nm">{line.name}</span>
            <span>{line.unit ? `${round(line.amount)} ${line.unit}` : round(line.amount)}</span>
          </div>
        ))}
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h2 className="title">Steps</h2>
          <ol>
            {recipe.steps.map((s) => (
              <li key={s.position} className="step body">{s.text}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes ? <p className="body" style={{ color: "var(--sage)" }}>{recipe.notes}</p> : null}
    </div>
  );
}
