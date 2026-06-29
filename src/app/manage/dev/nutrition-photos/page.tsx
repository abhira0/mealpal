"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NutritionPhoto } from "@/components/NutritionPhoto";

type Product = {
  id: number;
  name: string;
  nutritionPhoto: string | null;
  calories: number | null;
};

export default function NutritionPhotosPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Product[]) => setProducts(rows))
      .catch(() => setProducts([]));
  }, []);

  const withPhoto = products?.filter((p) => p.nutritionPhoto).length ?? 0;

  // Filter by name, then push uploaded (has photo) ones to the bottom.
  const shown = products
    ?.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(!!a.nutritionPhoto) - Number(!!b.nutritionPhoto));

  return (
    <>
      <header className="chrome">
        <Link href="/manage" className="chrome-back">← Manage</Link>
        <h1>Nutrition photos</h1>
      </header>

      <div className="content stack">
        <p className="section-label">
          Snap each product&apos;s nutrition-facts label. Fill the numbers later.
          {products ? ` (${withPhoto}/${products.length} have photos)` : ""}
        </p>

        <input
          type="search"
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input"
        />

        {!shown ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : shown.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No products yet.</p>
        ) : (
          shown.map((p) => (
            <section className="card stack" key={p.id}>
              <div className="card-row">
                <span className="title row-main">{p.name}</span>
                <span className="slot">{p.calories != null ? "✓ filled" : p.nutritionPhoto ? "photo only" : "—"}</span>
              </div>
              <NutritionPhoto productId={p.id} photo={p.nutritionPhoto} />
            </section>
          ))
        )}
      </div>
    </>
  );
}
