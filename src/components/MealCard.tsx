"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuantityChip } from "@/components/QuantityChip";

function shortServings(n: number): string {
  const v = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return `${v} srv`;
}

/**
 * A planned/cooked meal as a hairline card: recipe name (links to detail),
 * servings QuantityChip, status label, and a self-contained "Cook it" button
 * that POSTs to /api/events/:id/cook then refreshes the view.
 */
export function MealCard({
  eventId,
  title,
  servings,
  recipeId,
  status,
  onCooked,
}: {
  eventId: number;
  title: string;
  servings: number;
  recipeId: number;
  status: string;
  onCooked?: () => void;
}) {
  const router = useRouter();
  const [cooking, setCooking] = useState(false);
  const [local, setLocal] = useState(status);
  const cooked = local === "cooked";

  async function cook() {
    if (cooking) return;
    setCooking(true);
    const res = await fetch(`/api/events/${eventId}/cook`, { method: "POST" });
    setCooking(false);
    if (res.ok) {
      setLocal("cooked");
      if (onCooked) onCooked();
      else router.refresh();
    }
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Link
          href={`/recipes/${recipeId}`}
          className="title"
          style={{ color: "var(--ink)", textDecoration: "none", flex: 1 }}
        >
          {title}
        </Link>
        <QuantityChip value={shortServings(servings)} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 12,
        }}
      >
        <span className="slot">{cooked ? "✓ Cooked" : "Planned"}</span>
        {!cooked && (
          <button
            type="button"
            className="btn"
            onClick={cook}
            disabled={cooking}
            style={{ padding: "8px 14px", minHeight: 40 }}
          >
            {cooking ? "Cooking…" : "Cook it"}
          </button>
        )}
      </div>
    </div>
  );
}
