"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";

type Product = { id: number; name: string };
type Variant = { id: number; name: string };

export function QuickEat({ date, onLogged }: { date: string; onLogged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then(setProducts).catch(() => {});
  }, []);

  function selectProduct(id: number | null) {
    setProductId(id);
    setVariants([]);
    setVariantId(null);
    if (id == null) return;
    fetch(`/api/products/${id}/variants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Variant[]) => setVariants(rows))
      .catch(() => {});
  }

  async function logIt() {
    if (productId == null) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/eaten", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, productId, variantId, count: 1 }),
    });
    setBusy(false);
    if (res.ok) onLogged();
    else setError("Couldn't log that — try again.");
  }

  return (
    <section className="card stack-sm">
      <span className="eb">Ate a snack/packet</span>
      <Dropdown label="Product" value={productId} options={products.map((p) => ({ id: p.id, label: p.name }))}
        onChange={(v) => selectProduct(Number(v))} />
      {variants.length > 0 && (
        <Dropdown label="Which variant?" value={variantId} options={variants.map((v) => ({ id: v.id, label: v.name }))}
          onChange={(v) => setVariantId(Number(v))} />
      )}
      <button type="button" className="btn" disabled={busy || productId == null} onClick={logIt}>
        {busy ? "…" : "Ate it"}
      </button>
      {error && <p className="notice" style={{ color: "var(--paprika)" }}>{error}</p>}
    </section>
  );
}
