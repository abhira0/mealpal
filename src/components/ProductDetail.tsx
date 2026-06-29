"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Favicon } from "@/components/Favicon";
import { Sheet } from "@/components/Sheet";
import { EntityForm } from "@/components/EntityForm";

type Purchase = { cents: number; purchasedAt: string };
type Product = {
  id: number;
  name: string;
  ingredientId: number;
  shopId: number;
  packSize: number;
  priceCents: number | null;
  available: boolean;
  url: string | null;
  imageUrl: string | null;
  history: Purchase[];
  effectiveCents: number | null;
};
type Ingredient = { id: number; name: string; canonicalUnit: string };
type Shop = { id: number; name: string; website: string | null; iconUrl: string | null };

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const day = (d: string) => new Date(d).toLocaleDateString();

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ing-row" style={{ paddingTop: 0 }}>
      <span className="meta" style={{ flex: 1 }}>{label}</span>
      <span className="nm">{children}</span>
    </div>
  );
}

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [prodRes, ingRes, shopRes] = await Promise.all([
      fetch("/api/products", { cache: "no-store" }),
      fetch("/api/ingredients", { cache: "no-store" }),
      fetch("/api/shops", { cache: "no-store" }),
    ]);
    if (!prodRes.ok) {
      setError("Couldn't load this product.");
      return;
    }
    const all: Product[] = await prodRes.json();
    const found = all.find((p) => p.id === Number(id)) ?? null;
    setProduct(found);
    if (found && ingRes.ok) {
      const ings: Ingredient[] = await ingRes.json();
      setIngredient(ings.find((i) => i.id === found.ingredientId) ?? null);
    }
    if (found && shopRes.ok) {
      const shops: Shop[] = await shopRes.json();
      setShop(shops.find((s) => s.id === found.shopId) ?? null);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; state set after await, not synchronously
    load();
  }, [load]);

  async function onDelete() {
    setError(null);
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/manage/products");
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? "Couldn't delete this product.");
  }

  if (!product) {
    return (
      <div className="content">
        {error ? <p className="notice">{error}</p> : <p className="loading">Loading…</p>}
      </div>
    );
  }

  const unit = ingredient?.canonicalUnit ?? "";

  return (
    <>
      <header className="chrome">
        <Link href="/manage/products" className="chrome-back">← Products</Link>
        <h1>{product.name}</h1>
      </header>

      <div className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        <section className="card stack-sm">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" style={{ display: "block", maxHeight: 160, borderRadius: 8, margin: "0 auto" }} />
          )}
          {!product.available && <span className="chip run">unavailable</span>}
          <Field label="Ingredient">{ingredient?.name ?? "—"}</Field>
          <Field label="Shop">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {shop && <Favicon name={shop.name} website={shop.website} iconUrl={shop.iconUrl} size={20} />}
              {shop?.name ?? "—"}
            </span>
          </Field>
          <Field label="Pack size">{product.packSize}{unit}</Field>
          <Field label="Price">
            {money(product.effectiveCents)}
            {product.priceCents != null ? " (manual override)" : product.history.length ? " (latest purchase)" : ""}
          </Field>
          {product.url && (
            <Field label="URL">
              <a href={product.url} target="_blank" rel="noreferrer">Open ↗</a>
            </Field>
          )}
        </section>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn block" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="btn-link danger" style={{ width: "auto" }} onClick={onDelete}>Delete</button>
        </div>

        <section className="card stack-sm">
          <span className="section-label">Price history</span>
          {product.history.length === 0 ? (
            <p className="empty">No purchases recorded yet.</p>
          ) : (
            product.history.map((p, i) => (
              <div key={i} className="ing-row" style={{ paddingTop: 0 }}>
                <span className="meta" style={{ flex: 1 }}>{day(p.purchasedAt)}</span>
                <span className="nm mono">{money(p.cents)}</span>
              </div>
            ))
          )}
        </section>
      </div>

      <Sheet open={editing} title="Edit product" onClose={() => setEditing(false)}>
        <EntityForm slug="products" id={id} embedded onDone={() => { setEditing(false); load(); }} />
      </Sheet>
    </>
  );
}
