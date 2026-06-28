import { auth } from "@/auth";
import { db } from "@/db";
import { listIngredients } from "@/lib/ingredients";
import { listProductsForIngredient, latestPrice } from "@/lib/products";
import { centsToDollars } from "@/lib/money";

export default async function ProductsPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const ingredients = listIngredients(db, hid);
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Products by ingredient (preference order)</h1>
      {ingredients.map((ing) => {
        const products = listProductsForIngredient(db, hid, ing.id);
        return (
          <section key={ing.id}>
            <h2>{ing.name}</h2>
            <ol>
              {products.map((p) => {
                const price = latestPrice(db, p.id);
                return (
                  <li key={p.id}>
                    {p.name} — pack {p.packSize} {ing.canonicalUnit}
                    {price ? ` — $${centsToDollars(price.cents).toFixed(2)}` : " — no price"}
                    {p.available ? "" : " (unavailable)"}
                  </li>
                );
              })}
            </ol>
            {products.length === 0 && <p>No products for this ingredient.</p>}
          </section>
        );
      })}
      {ingredients.length === 0 && <p>Add ingredients first.</p>}
    </main>
  );
}
