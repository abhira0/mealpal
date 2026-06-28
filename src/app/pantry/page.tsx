import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { listIngredients } from "@/lib/ingredients";
import { stockByIngredient } from "@/lib/stock";
import { QuantityChip } from "@/components/QuantityChip";
import { StockAdjust } from "@/components/StockAdjust";
import { formatQty } from "@/lib/units";

export default async function PantryPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const hid = session.user.householdId;

  const ingredients = listIngredients(db, hid);
  const stock = stockByIngredient(db, hid);

  return (
    <main className="app-main">
      <div className="page-header">
        <p className="eyebrow">Pantry</p>
        <h1>What&apos;s in stock</h1>
      </div>

      {ingredients.length === 0 ? (
        <div className="empty-state">
          <p>No ingredients yet.</p>
          <Link className="btn btn-primary" href="/manage">
            Add ingredients
          </Link>
        </div>
      ) : (
        <div className="stack">
          {ingredients.map((ing) => {
            const qty = stock.get(ing.id) ?? 0;
            const threshold = ing.servingSize ?? 0;
            const low = qty <= threshold;
            return (
              <div className="card" key={ing.id}>
                <div className="row-between">
                  <span style={{ fontWeight: 600 }}>{ing.name}</span>
                  <QuantityChip
                    value={formatQty(qty, ing.canonicalUnit)}
                    tone={low ? "low" : "default"}
                  />
                </div>
                <div className="row-between" style={{ marginTop: 10 }}>
                  <span className="caption">
                    {low ? "Running low" : "Stocked"}
                  </span>
                  <StockAdjust ingredientId={ing.id} unit={ing.canonicalUnit} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
