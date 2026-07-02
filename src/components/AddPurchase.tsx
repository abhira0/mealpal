"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { Sheet } from "@/components/Sheet";

type Product = { id: number; name: string };
type Shop = { id: number; name: string };

// Backfill a purchase straight into the history tab: pick a tracked product,
// set quantity, an optional total price + expiry, and the date it was bought.
export function AddPurchase({
  products,
  shops = [],
  onAdded,
}: {
  products: Product[];
  shops?: Shop[];
  onAdded: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [shopId, setShopId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dollars, setDollars] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(today);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setProductId(""); setShopId(""); setQuantity("1"); setDollars("");
    setPurchasedAt(today); setExpiresAt("");
  }

  async function add() {
    if (!productId) { setError("Pick a product."); return; }
    const qty = Number(quantity) || 1;
    const amount = Number(dollars);
    if (dollars && (!Number.isFinite(amount) || amount < 0)) {
      setError("Enter a valid price.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: Number(productId),
        shopId: shopId ? Number(shopId) : null,
        quantity: qty,
        // Store per-unit cents (total / qty), matching how the bill row saves.
        cents: dollars ? Math.round(Math.round(amount * 100) / qty) : null,
        purchasedAt: purchasedAt || null,
        expiresAt: expiresAt || null,
      }),
    });
    setBusy(false);
    if (!res.ok) { setError("Couldn't add."); return; }
    reset();
    setOpen(false);
    onAdded();
  }

  return (
    <>
      <button type="button" className="btn-add" onClick={() => setOpen(true)}>
        <Plus size={16} style={{ verticalAlign: "-3px" }} /> Add a purchase
      </button>
      <Sheet open={open} title="Add a purchase" onClose={() => { setOpen(false); setError(null); }}>
      <div className="sh-body">
        <div className="addp-grid">
          <span className="eb">Product</span>
          <Dropdown
            label="Product bought"
            placeholder="Choose a product…"
            value={productId ? Number(productId) : null}
            options={products.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(id) => setProductId(String(id))}
          />

          {shops.length > 1 && (
            <>
              <span className="eb">Shop</span>
              <Dropdown
                label="Shop"
                placeholder="Product's usual shop"
                value={shopId ? Number(shopId) : null}
                options={shops.map((s) => ({ id: s.id, label: s.name }))}
                onChange={(id) => setShopId(String(id))}
              />
            </>
          )}

          <label className="eb" htmlFor="addp-total">$ total</label>
          <input
            id="addp-total"
            className="input mono"
            inputMode="decimal"
            placeholder="optional"
            value={dollars}
            onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
          />

          <label className="eb" htmlFor="addp-qty">Qty</label>
          <input
            id="addp-qty"
            className="input mono"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
          />

          <label className="eb" htmlFor="addp-bought">Bought</label>
          <input
            id="addp-bought"
            className="input"
            type="date"
            value={purchasedAt}
            max={today}
            onChange={(e) => setPurchasedAt(e.target.value)}
          />

          <label className="eb" htmlFor="addp-exp">Expires</label>
          <input
            id="addp-exp"
            className="input"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {error && <div className="eb" style={{ color: "var(--paprika)" }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={add} disabled={busy}>
            {busy ? "…" : "Add purchase"}
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
