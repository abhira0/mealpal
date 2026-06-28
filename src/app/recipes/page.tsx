import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { listRecipes } from "@/lib/recipes";
import { QuantityChip } from "@/components/QuantityChip";
import { formatServings } from "@/lib/units";

export default async function RecipesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const recipes = listRecipes(db, session.user.householdId);

  return (
    <main className="app-main">
      <div className="page-header">
        <p className="eyebrow">Recipes</p>
        <h1>The recipe box</h1>
      </div>

      {recipes.length === 0 ? (
        <div className="empty-state">
          <p>No recipes yet — add some to start planning.</p>
        </div>
      ) : (
        <div className="stack">
          {recipes.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} style={{ color: "var(--ink)" }}>
              <div className="card row-between">
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>
                  {r.name}
                </span>
                <QuantityChip value={formatServings(r.baseServings)} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
