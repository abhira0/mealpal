"use client";

import { useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import { EntityList } from "@/components/EntityList";
import { RecipeSheet } from "@/components/RecipeSheet";
import { RecipeView } from "@/components/RecipeView";
import { RECIPE_LIST } from "@/views/mobile/RecipesView";

export function DesktopRecipes() {
  const [createOpen, setCreateOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <DeskPage title="Recipes" testId="desktop-recipes">
        <div className="md-layout" data-testid="md-layout">
          <div className="md-list">
            <EntityList
              bare
              config={RECIPE_LIST}
              create={{ label: "+ New", onClick: () => setCreateOpen(true) }}
              reloadToken={reload}
              onSelect={(r) => setSelectedId(String(r.id))}
              selectedId={selectedId}
            />
          </div>
          <aside className="md-pane" data-testid="md-pane">
            {selectedId ? (
              <RecipeView key={selectedId} id={selectedId} />
            ) : (
              <div className="md-pane-empty">Select a recipe to view it here.</div>
            )}
          </aside>
        </div>
      </DeskPage>
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
