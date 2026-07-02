"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";

type Product = { id: number; name: string };

// Backfill a purchase straight into the history tab: pick a tracked product,
// set quantity, an optional total price + expiry, and the date it was bought.
export function AddPurchase({
  products,
  onAdded,
}: {
  products: Product[];
  onAdded: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dollars, setDollars] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(today);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setProductId(""); setQuantity("1"); setDollars("");
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

  if (!open) {
    return (
      <button type="button" className="btn-add" onClick={() => setOpen(true)}>
        <Plus size={16} style={{ verticalAlign: "-3px" }} /> Add a purchase
      </button>
    );
  }

  return (
    <div className="ticket">
      <div className="ticket-body stack" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Dropdown
          label="Product bought"
          placeholder="Choose a product…"
          value={productId ? Number(productId) : null}
          options={products.map((p) => ({ id: p.id, label: p.name }))}
          onChange={(id) => setProductId(String(id))}
        />

        <div className="bill-fields">
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            $ total
            <input
              className="input mono"
              inputMode="decimal"
              placeholder="optional"
              value={dollars}
              onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
              aria-label="Total paid"
              style={{ width: 80 }}
            />
          </label>
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            qty
            <input
              className="input mono"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
              aria-label="Quantity"
              style={{ width: 56 }}
            />
          </label>
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            bought
            <input
              className="input"
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              aria-label="Purchase date"
            />
          </label>
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            exp
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-label="Expiry date"
            />
          </label>
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
    </div>
  );
}
