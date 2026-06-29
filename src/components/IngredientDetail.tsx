"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Favicon } from "@/components/Favicon";
import { Sheet } from "@/components/Sheet";
import { EntityForm } from "@/components/EntityForm";

type Product = {
  id: number;
  name: string;
  shopId: number;
  shopName: string;
  shopWebsite: string | null;
  shopIconUrl: string | null;
  packSize: number;
  available: boolean;
  url: string | null;
  imageUrl: string | null;
  history: { cents: number }[];
  effectiveCents: number | null;
  costPerUnit: number | null; // cents per canonical unit
};

type Detail = {
  id: number;
  name: string;
  canonicalUnit: string;
  servingSize: number | null;
  stock: number;
  products: Product[];
  recipes: { id: number; name: string }[];
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// Cost comparator, made readable: per-each for counts, per-100 for weight/volume.
function unitCost(c: number | null, unit: string): string {
  if (c == null) return "—";
  if (unit === "count") return `${money(c)}/ea`;
  return `${money(c * 100)}/100${unit}`;
}

function history(p: Product): string {
  if (p.history.length === 0) return "no purchases yet";
  return p.history.slice(0, 4).map((h) => money(h.cents)).join(" · ");
}

function Row({ p, unit, draggable }: { p: Product; unit: string; draggable: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: p.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: p.available ? (isDragging ? 0.6 : 1) : 0.5,
  };
  return (
    <div ref={setNodeRef} style={style} className="ing-row">
      {draggable && (
        <button
          type="button"
          className="btn-link"
          style={{ width: "auto", cursor: "grab", touchAction: "none", fontSize: 18, padding: "0 4px" }}
          aria-label={`Reorder ${p.name}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      )}
      <Favicon name={p.name} iconUrl={p.imageUrl} size={48} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="nm" style={{ display: "block" }}>
          {p.name}
          {!p.available && <span className="chip run" style={{ marginLeft: 8 }}>unavailable</span>}
        </span>
        <span className="meta" style={{ display: "block" }}>
          {p.shopName} · {p.packSize}{unit} · {p.effectiveCents != null ? money(p.effectiveCents) : "—"}
        </span>
        <span className="meta" style={{ display: "block" }}>{history(p)}</span>
      </span>
      <span className="chip price">{unitCost(p.costPerUnit, unit)}</span>
    </div>
  );
}

export function IngredientDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<"priority" | "price">("priority");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/ingredients/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load this ingredient.");
      return;
    }
    const d: Detail = await res.json();
    setDetail(d);
    setProducts(d.products);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; state set after await, not synchronously
    load();
  }, [load]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);
    const next = arrayMove(products, oldIndex, newIndex);
    setProducts(next); // optimistic
    const res = await fetch(`/api/ingredients/${id}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((p) => p.id) }),
    });
    if (!res.ok) {
      setError("Couldn't save the new order.");
      load(); // revert to server truth
    }
  }

  if (!detail) {
    return (
      <div className="content">
        {error ? <p className="notice">{error}</p> : <p className="loading">Loading…</p>}
      </div>
    );
  }

  const unit = detail.canonicalUnit;
  const shown =
    view === "price"
      ? [...products].sort((a, b) => (a.costPerUnit ?? Infinity) - (b.costPerUnit ?? Infinity))
      : products;

  return (
    <>
      <header className="chrome">
        <Link href="/manage/ingredients" className="chrome-back">← Ingredients</Link>
        <h1>{detail.name}</h1>
      </header>

      <div className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        <section className="card stack-sm">
          <div className="ing-row" style={{ borderBottom: "none", paddingTop: 0 }}>
            <span style={{ flex: 1 }}>
              <span className="meta" style={{ display: "block" }}>Unit: {unit}</span>
              <span className="meta" style={{ display: "block" }}>
                Serving size: {detail.servingSize != null ? `${detail.servingSize}${unit}` : "—"}
              </span>
            </span>
            <span className="chip">{detail.stock}{unit} in stock</span>
            <button type="button" className="btn-link" style={{ width: "auto" }} onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        </section>

        <div style={{ display: "flex", gap: 8 }} role="tablist" aria-label="Sort products">
          <button type="button" role="tab" className="tab" aria-selected={view === "priority"} onClick={() => setView("priority")}>
            Priority
          </button>
          <button type="button" role="tab" className="tab" aria-selected={view === "price"} onClick={() => setView("price")}>
            By price
          </button>
        </div>

        <section className="card">
          {shown.length === 0 ? (
            <p className="empty">No products yet.</p>
          ) : view === "priority" ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={shown.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {shown.map((p) => (
                  <Row key={p.id} p={p} unit={unit} draggable />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            shown.map((p) => <Row key={p.id} p={p} unit={unit} draggable={false} />)
          )}
        </section>

        <button type="button" className="btn block" onClick={() => setAdding(true)}>
          + Add product
        </button>

        {detail.recipes.length > 0 && (
          <section className="card stack-sm">
            <span className="section-label">Used in recipes</span>
            {detail.recipes.map((r) => (
              <Link key={r.id} href={`/recipes/${r.id}`} className="ing-row" style={{ textDecoration: "none" }}>
                <span className="nm" style={{ flex: 1 }}>{r.name}</span>
                <span className="arrow" aria-hidden="true">›</span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <Sheet open={editing} title="Edit ingredient" onClose={() => setEditing(false)}>
        <EntityForm slug="ingredients" id={id} embedded onDone={() => { setEditing(false); load(); }} />
      </Sheet>

      <Sheet open={adding} title="Add product" onClose={() => setAdding(false)}>
        <EntityForm
          slug="products"
          embedded
          lockedValues={{ ingredientId: id }}
          onDone={() => { setAdding(false); load(); }}
        />
      </Sheet>
    </>
  );
}
