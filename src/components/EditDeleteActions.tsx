"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The one standard Edit/Delete block for every entity detail view:
// a full-width "Edit" button (opens the edit sheet) and a red "Delete X" link.
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
      <button type="button" className="btn block" onClick={onEdit}>
        Edit
      </button>
      {error && <p className="notice" style={{ marginTop: 0 }}>{error}</p>}
      <button type="button" className="btn-link danger" style={{ width: "auto" }} onClick={remove}>
        Delete {singular}
      </button>
    </>
  );
}
