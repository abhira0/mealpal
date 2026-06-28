"use client";

import { useState } from "react";
import { QuantityChip } from "@/components/QuantityChip";
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
  total,
  lines,
  prices,
}: {
  shopName: string;
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
    <div className="ticket" style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span className="title">{shopName}</span>
        <span
          className="chip price"
          style={{ background: "transparent", border: "none", paddingRight: 0 }}
        >
          ${centsToDollars(total).toFixed(2)}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((line, i) => (
          <ShopLineRow
            key={line.ingredientId}
            line={line}
            priceCents={line.product ? prices[line.product.id] ?? null : null}
            struck={struck.has(line.ingredientId)}
            first={i === 0}
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
  first,
  onBought,
}: {
  line: ShopLine;
  priceCents: number | null;
  struck: boolean;
  first: boolean;
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

  return (
    <div
      style={{
        borderTop: first ? "none" : "1px solid var(--line-soft)",
        padding: "12px 0",
        opacity: struck ? 0.5 : 1,
        transition: "opacity .25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <CustomCheckbox
          checked={pricing || struck}
          onChange={onCheck}
          label={`Mark ${line.ingredientName} bought`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              textDecoration: struck ? "line-through" : "none",
              color: struck ? "var(--sage)" : "var(--ink)",
            }}
          >
            {line.ingredientName}
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--sage)",
              marginTop: 2,
            }}
          >
            {line.product ? line.product.name : "No product on file"}
            {priceCents != null && (
              <> · ${centsToDollars(priceCents).toFixed(2)}</>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <QuantityChip value={`need ${formatNeeded(line)}`} tone="default" />
            {line.urgency && (
              <QuantityChip value={line.urgency.label} tone={line.urgency.tone} />
            )}
          </div>
        </div>
      </div>

      {pricing && line.product && !struck && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            flexWrap: "wrap",
            paddingLeft: 34,
          }}
        >
          <PriceInput value={dollars} onChange={setDollars} onSubmit={record} />
          <button
            type="button"
            className="btn"
            style={{ padding: "9px 14px", minHeight: 40 }}
            onClick={record}
            disabled={busy}
          >
            {busy ? "…" : "Record"}
          </button>
          <button
            type="button"
            onClick={() => setPricing(false)}
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--sage)",
              background: "none",
              border: "none",
              cursor: "pointer",
              minHeight: 40,
            }}
          >
            cancel
          </button>
          {error && (
            <span className="eb" style={{ color: "var(--paprika)" }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Custom $ input (no native number control beyond a styled text field). */
function PriceInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "#fff",
        padding: "0 10px",
        minHeight: 40,
        fontFamily: "var(--mono)",
        fontWeight: 700,
      }}
    >
      <span style={{ color: "var(--sage)", marginRight: 2 }}>$</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        aria-label="Price paid in dollars"
        autoFocus
        style={{
          width: 70,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--mono)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--ink)",
        }}
      />
    </span>
  );
}

/** Hand-built checkbox using the locked .checkbox class (no native input). */
function CustomCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <span
      className="checkbox"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      style={{ marginTop: 2, cursor: "pointer" }}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    />
  );
}

function formatNeeded(line: ShopLine): string {
  if (line.unit) return formatQty(line.needed, line.unit);
  return Number.isInteger(line.needed)
    ? String(line.needed)
    : String(Math.round(line.needed * 100) / 100);
}
