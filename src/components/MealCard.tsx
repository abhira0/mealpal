"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuantityChip } from "@/components/QuantityChip";
import { Sheet } from "@/components/Sheet";

type DeleteScope = "one" | "following" | "all";

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
  recurring = false,
  onCooked,
  onDeleted,
}: {
  eventId: number;
  title: string;
  servings: number;
  recipeId: number;
  status: string;
  recurring?: boolean;
  onCooked?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [cooking, setCooking] = useState(false);
  const [local, setLocal] = useState(status);
  const [askScope, setAskScope] = useState(false);
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

  async function uncook() {
    if (cooking) return;
    setCooking(true);
    const res = await fetch(`/api/events/${eventId}/cook`, { method: "DELETE" });
    setCooking(false);
    if (res.ok) {
      setLocal("planned");
      router.refresh();
    }
  }

  async function remove(scope: DeleteScope = "one") {
    setAskScope(false);
    const res = await fetch(`/api/events/${eventId}?scope=${scope}`, { method: "DELETE" });
    if (res.ok) {
      if (onDeleted) onDeleted();
      else router.refresh();
    }
  }

  return (
    <div className="card">
      <div className="card-row">
        <Link href={`/recipes/${recipeId}`} className="title row-main">
          {title}
        </Link>
        <QuantityChip value={shortServings(servings)} />
      </div>
      <div className="card-row" style={{ marginTop: 12 }}>
        <span className="slot">{cooked ? "✓ Cooked" : "Planned"}</span>
        {cooked ? (
          <button type="button" className="btn-add" onClick={uncook} disabled={cooking}>
            {cooking ? "Undoing…" : "Undo"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-add"
              onClick={() => (recurring ? setAskScope(true) : remove("one"))}
              aria-label="Remove meal"
            >
              Remove
            </button>
            <button type="button" className="btn" onClick={cook} disabled={cooking}>
              {cooking ? "Cooking…" : "Cook it"}
            </button>
          </div>
        )}
      </div>

      <Sheet open={askScope} title="Remove repeating meal" onClose={() => setAskScope(false)}>
        <div className="sh-body">
          <p className="body" style={{ color: "var(--sage)" }}>
            “{title}” repeats. What do you want to remove?
          </p>
          <button type="button" className="btn block" onClick={() => remove("one")}>
            This meal only
          </button>
          <button type="button" className="btn block" onClick={() => remove("following")}>
            This and all future meals
          </button>
          <button type="button" className="btn block" onClick={() => remove("all")}>
            All meals in the series
          </button>
        </div>
      </Sheet>
    </div>
  );
}
