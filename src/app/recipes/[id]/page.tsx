"use client";

import { use } from "react";
import { RecipeView } from "@/components/RecipeView";

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RecipeView id={id} />;
}
