"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Favicon } from "@/components/Favicon";
import { Sheet } from "@/components/Sheet";
import { EntityForm } from "@/components/EntityForm";
import { EditDeleteActions } from "@/components/EditDeleteActions";

type Shop = { id: number; name: string; website: string | null; iconUrl: string | null };
type Product = {
  id: number;
  name: string;
  ingredientId: number;
  shopId: number;
  packSize: number;
  available: boolean;
  imageUrl: string | null;
  effectiveCents: number | null;
};

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

export function ShopDetail({ id }: { id: string }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [shopsRes, prodRes, ingRes] = await Promise.all([
      fetch("/api/shops", { cache: "no-store" }),
      fetch("/api/products", { cache: "no-store" }),
      fetch("/api/ingredients", { cache: "no-store" }),
    ]);
    if (!shopsRes.ok || !prodRes.ok) {
      setError("Couldn't load this shop.");
      return;
    }
    const shops: Shop[] = await shopsRes.json();
    const found = shops.find((s) => s.id === Number(id)) ?? null;
    setShop(found);
    const all: Product[] = await prodRes.json();
    setProducts(all.filter((p) => p.shopId === Number(id)));
    if (ingRes.ok) {
      const ings: { id: number; name: string }[] = await ingRes.json();
      setIngredients(Object.fromEntries(ings.map((i) => [i.id, i.name])));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; state set after await, not synchronously
    load();
  }, [load]);

  if (!shop) {
    return (
      <div className="content">
        {error ? <p className="notice">{error}</p> : <p className="loading">Loading…</p>}
      </div>
    );
  }

  return (
    <>
      <header className="chrome">
        <Link href="/manage/shops" className="chrome-back">← Shops</Link>
        <h1>{shop.name}</h1>
      </header>

      <div className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        <section className="card stack-sm">
          <div className="ing-row" style={{ borderBottom: "none", paddingTop: 0 }}>
            <Favicon name={shop.name} website={shop.website} iconUrl={shop.iconUrl} size={48} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {shop.website && (
                <span className="meta" style={{ display: "block" }}>{shop.website}</span>
              )}
            </span>
          </div>
        </section>

        <EditDeleteActions
          singular="shop"
          deletePath={`/api/shops/${id}`}
          backHref="/manage/shops"
          onEdit={() => setEditing(true)}
        />

        <span className="chip">{products.length} {products.length === 1 ? "product" : "products"}</span>

        <section className="card">
          {products.length === 0 ? (
            <p className="empty">No products yet.</p>
          ) : (
            products.map((p) => (
              <div key={p.id} className="ing-row" style={{ opacity: p.available ? 1 : 0.5 }}>
                <Favicon name={p.name} iconUrl={p.imageUrl} size={48} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="nm" style={{ display: "block" }}>
                    {p.name}
                    {!p.available && <span className="chip run" style={{ marginLeft: 8 }}>unavailable</span>}
                  </span>
                  <span className="meta" style={{ display: "block" }}>
                    {ingredients[p.ingredientId] ?? "—"} · pack {p.packSize}
                  </span>
                </span>
                <span className="chip price">{money(p.effectiveCents)}</span>
              </div>
            ))
          )}
        </section>

        <button type="button" className="btn block" onClick={() => setAdding(true)}>
          + Add product
        </button>
      </div>

      <Sheet open={editing} title="Edit shop" onClose={() => setEditing(false)}>
        <EntityForm slug="shops" id={id} embedded onDone={() => { setEditing(false); load(); }} />
      </Sheet>

      <Sheet open={adding} title="Add product" onClose={() => setAdding(false)}>
        <EntityForm
          slug="products"
          embedded
          lockedValues={{ shopId: id }}
          onDone={() => { setAdding(false); load(); }}
        />
      </Sheet>
    </>
  );
}
