"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function remove() {
    dialogRef.current?.close();
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
        <button type="button" className="btn block danger" onClick={() => dialogRef.current?.showModal()} aria-label={`Delete ${singular}`}>
          <Trash2 size={18} />
        </button>
      </div>
      {error && <p className="notice" style={{ marginTop: 0 }}>{error}</p>}
      <dialog ref={dialogRef} className="confirm">
        <p>Delete this {singular}?</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      </dialog>
    </>
  );
}
