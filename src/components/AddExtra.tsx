"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { Sheet } from "@/components/Sheet";

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

  return (
    <>
      <button type="button" className="btn-add" onClick={() => setOpen(true)}>
        <Plus size={16} style={{ verticalAlign: "-3px" }} /> Add an item
      </button>
      <Sheet open={open} title="Add an item" onClose={() => { setOpen(false); setError(null); }}>
      <div className="sh-body">
        <div className="unit-radio">
          <button type="button" onClick={() => setMode("custom")} aria-pressed={mode === "custom"}>
            One-off
          </button>
          <button type="button" onClick={() => setMode("product")} aria-pressed={mode === "product"}>
            Product
          </button>
        </div>

        <div className="addp-grid">
          {mode === "product" ? (
            <>
              <span className="eb">Product</span>
              <Dropdown
                label="Product to add"
                placeholder="Choose a product…"
                value={productId ? Number(productId) : null}
                options={products.map((p) => ({ id: p.id, label: p.name }))}
                onChange={(id) => setProductId(String(id))}
              />
            </>
          ) : (
            <>
              <label className="eb" htmlFor="addx-name">Item</label>
              <input
                id="addx-name"
                className="input"
                placeholder="e.g. Paper towels"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="eb">Stop</span>
              <Dropdown
                label="Stop (optional)"
                placeholder="No stop"
                value={shopId ? Number(shopId) : null}
                options={shops.map((s) => ({ id: s.id, label: s.name }))}
                onChange={(id) => setShopId(String(id))}
              />
            </>
          )}

          <label className="eb" htmlFor="addx-qty">Qty</label>
          <input
            id="addx-qty"
            className="input mono"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>

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
      </Sheet>
    </>
  );
}
