"use client";

import { useState } from "react";
import { CookMode } from "@/components/CookMode";
import type { EditableRecipe } from "@/components/RecipeSheet";

// Launches read-only Cook mode from the public shared-recipe page.
export function PublicCookButton({ recipe }: { recipe: EditableRecipe }) {
  const [cooking, setCooking] = useState(false);
  if (recipe.steps.length === 0) return null;
  return (
    <>
      <button type="button" className="btn cook-btn" onClick={() => setCooking(true)}>
        ⛶ Cook
      </button>
      {cooking && <CookMode recipe={recipe} onClose={() => setCooking(false)} readOnly />}
    </>
  );
}
