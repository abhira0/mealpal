"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

type Product = { id: number; name: string };
type Shop = { id: number; name: string };

// Manually add a line to the run: pick a tracked product, or type a one-off item.
export function AddExtra({
  products,
  shops,
  onAdded,
}: {
  products: Product[];
  shops: Shop[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"product" | "custom">("custom");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [shopId, setShopId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const body =
      mode === "product"
        ? { productId: Number(productId), quantity: Number(quantity) || 1 }
        : { title: title.trim(), shopId: shopId ? Number(shopId) : null, quantity: Number(quantity) || 1 };
    if (mode === "product" ? !body.productId : !title.trim()) {
      setError(mode === "product" ? "Pick a product." : "Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/shopping/extras", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setError("Couldn't add."); return; }
    setProductId(""); setTitle(""); setQuantity("1");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return (
      <button type="button" className="btn-add" onClick={() => setOpen(true)}>
        <Plus size={16} style={{ verticalAlign: "-3px" }} /> Add an item
      </button>
    );
  }

  return (
    <div className="ticket">
      <div className="ticket-body stack" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="unit-radio">
          <button type="button" onClick={() => setMode("custom")} aria-pressed={mode === "custom"}>
            One-off
          </button>
          <button type="button" onClick={() => setMode("product")} aria-pressed={mode === "product"}>
            Product
          </button>
        </div>

        {mode === "product" ? (
          <select
            className="input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Product to add"
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              className="input"
              placeholder="e.g. Paper towels"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Item name"
            />
            <select
              className="input"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              aria-label="Stop (optional)"
            >
              <option value="">No stop</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </>
        )}

        <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          qty
          <input
            className="input mono"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
            aria-label="Quantity"
            style={{ width: 64 }}
          />
        </label>

        {error && <div className="eb" style={{ color: "var(--paprika)" }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={add} disabled={busy}>
            {busy ? "…" : "Add to the run"}
          </button>
          <button type="button" className="btn-link" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
