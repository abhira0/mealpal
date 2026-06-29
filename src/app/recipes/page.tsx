"use client";

import { useState } from "react";
import { EntityList } from "@/components/EntityList";
import { RecipeSheet } from "@/components/RecipeSheet";
import type { ListConfig } from "@/app/manage/entities";

const RECIPE_LIST: ListConfig = {
  label: "Recipes",
  listPath: "/api/recipes",
  itemPath: (id) => `/api/recipes/${id}`, // unused (canDelete: false), edit happens on detail page
  canEdit: true,
  canDelete: false,
  columns: [
    { key: "name", label: "Name" },
    {
      key: "meta",
      label: "", // label-less meta line: "Serves 4 · $3.20/meal"
      format: (r) => {
        const servings = Number(r.baseServings);
        const cents = r.costCents == null ? null : Number(r.costCents);
        const perMeal =
          cents != null && servings > 0
            ? ` · $${(cents / servings / 100).toFixed(2)}/meal`
            : "";
        return `Serves ${servings}${perMeal}`;
      },
    },
  ],
};

export default function RecipesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [reload, setReload] = useState(0);

  return (
    <>
      <EntityList
        config={RECIPE_LIST}
        detailHref={(r) => `/recipes/${r.id}`}
        create={{ label: "+ New", onClick: () => setCreateOpen(true) }}
        reloadToken={reload}
      />
      <RecipeSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          setReload((n) => n + 1);
        }}
      />
    </>
  );
}
