import Link from "next/link";
import { QuantityChip } from "@/components/QuantityChip";
import { formatServings } from "@/lib/units";

export function MealCard({
  title,
  servings,
  recipeId,
  status,
  onCook,
  cooking,
}: {
  title: string;
  servings: number;
  recipeId: number;
  status: string;
  onCook?: () => void;
  cooking?: boolean;
}) {
  const cooked = status === "cooked";
  return (
    <div className="card">
      <div className="row-between">
        <Link href={`/recipes/${recipeId}`} style={{ flex: 1, color: "var(--ink)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>
            {title}
          </span>
        </Link>
        <QuantityChip value={formatServings(servings)} />
      </div>
      <div className="row-between" style={{ marginTop: 12 }}>
        <span className="caption mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {cooked ? "✓ Cooked" : "Planned"}
        </span>
        {status === "planned" && onCook && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onCook}
            disabled={cooking}
          >
            {cooking ? "Cooking…" : "Cook it"}
          </button>
        )}
      </div>
    </div>
  );
}
