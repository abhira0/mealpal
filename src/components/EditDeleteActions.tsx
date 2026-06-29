"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

// The one standard Edit/Delete block for every entity detail view:
// two icon buttons in a row — edit (opens the edit sheet) and red delete.
export function EditDeleteActions({
  singular,
  deletePath,
  backHref,
  onEdit,
}: {
  singular: string; // e.g. "shop"
  deletePath: string; // DELETE endpoint, e.g. /api/shops/3
  backHref: string; // where to go after delete, e.g. /manage/shops
  onEdit: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete this ${singular}?`)) return;
    setError(null);
    const res = await fetch(deletePath, { method: "DELETE" });
    if (res.ok) {
      router.push(backHref);
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? `Couldn't delete this ${singular}.`);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn block" onClick={onEdit} aria-label={`Edit ${singular}`}>
          <Pencil size={18} />
        </button>
        <button type="button" className="btn block danger" onClick={remove} aria-label={`Delete ${singular}`}>
          <Trash2 size={18} />
        </button>
      </div>
      {error && <p className="notice" style={{ marginTop: 0 }}>{error}</p>}
    </>
  );
}
