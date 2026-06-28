"use client";

import { useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
import { Favicon } from "@/components/Favicon";
import { dollarsToCents, centsToDollars } from "@/lib/money";
import { formatQty } from "@/lib/units";

export type ShopLine = {
  ingredientId: number;
  ingredientName: string;
  needed: number;
  unit?: string;
  product: { id: number; name: string } | null;
  /** Run-out urgency, best-effort. e.g. "out now", "~ Mon". */
  urgency?: { label: string; tone: "run" | "low" } | null;
};

/** productId -> latest/override price in cents (for prefill + meta + total). */
export type PriceMap = Record<number, number | null>;

export function ShopTicket({
  shopName,
  website,
  iconUrl,
  total,
  lines,
  prices,
}: {
  shopName: string;
  website?: string | null;
  iconUrl?: string | null;
  total: number; // running total in cents for this ticket
  lines: ShopLine[];
  prices: PriceMap;
}) {
  // ingredientId of lines that have been bought (struck, then removed).
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [struck, setStruck] = useState<Set<number>>(new Set());

  const visible = lines.filter((l) => !removed.has(l.ingredientId));
  if (visible.length === 0) return null;

  return (
    <div className="ticket">
      <div className="ticket-head">
        <p className="eb">Stop</p>
        <h2>
          <Favicon name={shopName} website={website} iconUrl={iconUrl} size={22} />
          {shopName}
          {total > 0 && (
            <span className="tk-total">${centsToDollars(total).toFixed(2)}</span>
          )}
        </h2>
      </div>
      <div className="ticket-body">
        {visible.map((line) => (
          <ShopLineRow
            key={line.ingredientId}
            line={line}
            priceCents={line.product ? prices[line.product.id] ?? null : null}
            struck={struck.has(line.ingredientId)}
            onBought={() => {
              setStruck((prev) => new Set(prev).add(line.ingredientId));
              // brief strike-through, then drop the line
              setTimeout(() => {
                setRemoved((prev) => new Set(prev).add(line.ingredientId));
              }, 450);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ShopLineRow({
  line,
  priceCents,
  struck,
  onBought,
}: {
  line: ShopLine;
  priceCents: number | null;
  struck: boolean;
  onBought: () => void;
}) {
  const [pricing, setPricing] = useState(false);
  const [dollars, setDollars] = useState(
    priceCents != null ? centsToDollars(priceCents).toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onCheck(checked: boolean) {
    if (!checked) {
      setPricing(false);
      return;
    }
    if (!line.product) {
      // No product on file — nothing to price; just strike it off.
      onBought();
      return;
    }
    setPricing(true);
  }

  async function record() {
    if (!line.product) return;
    const amount = Number(dollars);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a price.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: line.product.id,
        quantity: 1,
        dollars: amount,
        cents: dollarsToCents(amount),
      }),
    });
    setBusy(false);
    if (res.ok) {
      onBought();
    } else {
      setError("Couldn't record.");
    }
  }

  const checked = pricing || struck;

  return (
    <div className={struck ? "ticket-row done" : "ticket-row"}>
      <button
        type="button"
        className="checkbox"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Mark ${line.ingredientName} bought`}
        onClick={() => onCheck(!checked)}
      />
      <div className="tk-main">
        <div className="tk-name">{line.ingredientName}</div>
        <div className="tk-meta">
          {line.product ? line.product.name : "No product on file"}
          {priceCents != null && <> · ${centsToDollars(priceCents).toFixed(2)}</>}
        </div>
        <div className="tk-chips">
          <QuantityChip value={`need ${formatNeeded(line)}`} tone="default" />
          {line.urgency && (
            <QuantityChip value={line.urgency.label} tone={line.urgency.tone} />
          )}
        </div>

        {pricing && line.product && !struck && (
          <div className="servings-row" style={{ marginTop: 10, justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <span className="input mono" style={{ display: "inline-flex", alignItems: "center", width: "auto", padding: "0 10px", minHeight: 40 }}>
              <span style={{ color: "var(--sage)", marginRight: 2 }}>$</span>
              <input
                inputMode="decimal"
                value={dollars}
                onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    record();
                  }
                }}
                aria-label="Price paid in dollars"
                autoFocus
                style={{ width: 70, border: "none", outline: "none", background: "transparent", font: "inherit", color: "inherit" }}
              />
            </span>
            <button type="button" className="tab" onClick={record} disabled={busy}>
              {busy ? "…" : "Record"}
            </button>
            <button type="button" className="btn-link" onClick={() => setPricing(false)}>
              cancel
            </button>
            {error && <span className="eb" style={{ color: "var(--paprika)" }}>{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function formatNeeded(line: ShopLine): string {
  if (line.unit) return formatQty(line.needed, line.unit);
  return Number.isInteger(line.needed)
    ? String(line.needed)
    : String(Math.round(line.needed * 100) / 100);
}
