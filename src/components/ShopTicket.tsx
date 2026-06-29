"use client";

import { useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
import { Favicon } from "@/components/Favicon";
import { centsToDollars } from "@/lib/money";
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
  // ingredientId of lines that have been bought — struck and sunk to the bottom.
  const [struck, setStruck] = useState<Set<number>>(new Set());

  // bought lines drop to the bottom, but stay visible
  const ordered = [...lines].sort(
    (a, b) => Number(struck.has(a.ingredientId)) - Number(struck.has(b.ingredientId)),
  );

  return (
    <Ticket shopName={shopName} website={website} iconUrl={iconUrl} total={total}>
      {ordered.map((line) => (
        <ShopLineRow
          key={line.ingredientId}
          line={line}
          priceCents={line.product ? prices[line.product.id] ?? null : null}
          struck={struck.has(line.ingredientId)}
          onBought={() =>
            setStruck((prev) => new Set(prev).add(line.ingredientId))
          }
        />
      ))}
    </Ticket>
  );
}

/** Stop card chrome — header + body — shared by the run and the bill. */
export function Ticket({
  shopName,
  website,
  iconUrl,
  total,
  children,
}: {
  shopName: string;
  website?: string | null;
  iconUrl?: string | null;
  total?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="ticket">
      <div className="ticket-head">
        <p className="eb">Stop</p>
        <h2>
          <Favicon name={shopName} website={website} iconUrl={iconUrl} size={22} />
          {shopName}
          {total != null && total > 0 && (
            <span className="tk-total">${centsToDollars(total).toFixed(2)}</span>
          )}
        </h2>
      </div>
      <div className="ticket-body">{children}</div>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One tap = bought. Records a price-less purchase (restocks now); the price +
  // expiry get filled in later on the bill screen. No product on file → just strike.
  async function onCheck() {
    if (struck || busy) return;
    if (!line.product) {
      onBought();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: line.product.id, quantity: 1 }),
    });
    setBusy(false);
    if (res.ok) onBought();
    else setError("Couldn't record.");
  }

  return (
    <div className={struck ? "ticket-row done" : "ticket-row"}>
      <button
        type="button"
        className="checkbox"
        role="checkbox"
        aria-checked={struck}
        aria-label={`Mark ${line.ingredientName} bought`}
        disabled={busy}
        onClick={onCheck}
      />
      <div className="tk-main">
        <div className="tk-name">{line.ingredientName}</div>
        <div className="tk-meta">
          {line.product ? line.product.name : "No product on file"}
          {priceCents != null && <> · ~${centsToDollars(priceCents).toFixed(2)}</>}
        </div>
        <div className="tk-chips">
          <QuantityChip value={`need ${formatNeeded(line)}`} tone="default" />
          {line.urgency && (
            <QuantityChip value={line.urgency.label} tone={line.urgency.tone} />
          )}
        </div>
        {error && <div className="eb" style={{ color: "var(--paprika)", marginTop: 6 }}>{error}</div>}
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
