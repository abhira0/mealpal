"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RecipeSheet } from "@/components/RecipeSheet";

type Recipe = {
  id: number;
  name: string;
  baseServings: number;
  notes: string | null;
  costCents: number | null;
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function loadRecipes() {
    const res = await fetch("/api/recipes");
    if (res.ok) setRecipes(await res.json());
  }

  useEffect(() => {
    loadRecipes();
  }, []);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <>
      <header className="chrome">
        <Link href="/manage" className="chrome-back">← Catalog</Link>
        <h1>Recipes</h1>
      </header>

      <div className="content stack-sm">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="search" style={{ flex: 1 }}>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes"
              aria-label="Search recipes"
              className="input"
            />
          </div>
          <button type="button" className="btn" style={{ flex: "0 0 auto" }} onClick={() => setCreateOpen(true)}>
            + New recipe
          </button>
        </div>

        {recipes === null ? (
          <p className="loading">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty">
            {recipes.length === 0
              ? "No recipes yet — add one to start planning."
              : "No recipes match your search."}
          </p>
        ) : (
          filtered.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="row">
              <span className="row-link">
                <span className="thumb" aria-hidden="true" />
                <span className="row-main">
                  <span className="title" style={{ display: "block" }}>{r.name}</span>
                  <span className="meta">
                    Serves {r.baseServings}
                    {r.costCents != null && r.baseServings > 0
                      ? ` · $${(r.costCents / r.baseServings / 100).toFixed(2)}/meal`
                      : ""}
                  </span>
                </span>
              </span>
              <ChevronRight className="arrow" size={16} aria-hidden="true" />
            </Link>
          ))
        )}      </div>

      <RecipeSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadRecipes();
        }}
      />
    </>
  );
}
