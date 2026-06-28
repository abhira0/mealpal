import { auth } from "@/auth";
import { db } from "@/db";
import { listIngredients } from "@/lib/ingredients";

export default async function IngredientsPage() {
  const session = await auth();
  const rows = session ? listIngredients(db, session.user.householdId) : [];
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Ingredients</h1>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.name} — {r.canonicalUnit}
            {r.servingSize ? ` (1 serving = ${r.servingSize} ${r.canonicalUnit})` : ""}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p>No ingredients yet. POST to /api/ingredients to add one.</p>}
    </main>
  );
}
