"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MealCard } from "@/components/MealCard";

/** Client wrapper that turns a planned MealCard's "Cook it" into a POST. */
export function CookButton({
  eventId,
  title,
  servings,
  recipeId,
  status,
}: {
  eventId: number;
  title: string;
  servings: number;
  recipeId: number;
  status: string;
}) {
  const router = useRouter();
  const [cooking, setCooking] = useState(false);
  const [local, setLocal] = useState(status);

  async function cook() {
    setCooking(true);
    const res = await fetch(`/api/events/${eventId}/cook`, { method: "POST" });
    setCooking(false);
    if (res.ok) {
      setLocal("cooked");
      router.refresh();
    }
  }

  return (
    <MealCard
      title={title}
      servings={servings}
      recipeId={recipeId}
      status={local}
      onCook={cook}
      cooking={cooking}
    />
  );
}
