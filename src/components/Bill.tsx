"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Ticket } from "@/components/ShopTicket";
import { Dropdown } from "@/components/Dropdown";
import { AddPurchase } from "@/components/AddPurchase";
import { Favicon } from "@/components/Favicon";
import { centsToDollars } from "@/lib/money";

type Pending = {
  id: number;
  productId: number;
  ingredientId: number;
  productName: string;
  shopId: number;
  shopName: string;
  website: string | null;
  iconUrl: string | null;
  quantity: number;
  expiresAt: string | null;
  hintCents: number | null;
  purchasedAt?: string;
};

type Product = { id: number; name: string; ingredientId: number };
type Shop = { id: number; name: string };

// history mode lists every purchase (priced or not) for review/editing, instead
// of just the unpriced ones awaiting a price on the bill screen.
const PAGE = 50; // history page size for infinite scroll

// A stop's bill total: per-unit price × qty, summed. Unpriced rows count as 0.
const groupTotal = (group: Pending[]) =>
  group.reduce((sum, r) => sum + (r.hintCents ?? 0) * r.quantity, 0);

export function Bill({ onCount, history = false }: { onCount?: (n: number) => void; history?: boolean }) {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false); // history: no more pages
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // First page (history) or the whole pending list. Also used to regroup after a swap.
  const loadFirst = useCallback(() => {
    return fetch(history ? `/api/purchases?all=1&limit=${PAGE}` : "/api/purchases")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Pending[]) => {
        setRows(j);
        onCount?.(j.length);
        setExhausted(history && j.length < PAGE); // also resets after a swap-reload
      })
      .catch(() => setError("Couldn't load the bill."));
  }, [history, onCount]);

  // history: append the next page when the sentinel scrolls into view.
  const loadMore = useCallback(() => {
    if (!history || busyRef.current || exhausted || rows === null) return;
    busyRef.current = true;
    fetch(`/api/purchases?all=1&offset=${rows.length}&limit=${PAGE}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Pending[]) => {
        // dedupe: editing a buy date reorders rows server-side, so an offset page
        // can re-serve a row we already have.
        setRows((prev) => {
          const seen = new Set((prev ?? []).map((r) => r.id));
          return [...(prev ?? []), ...j.filter((r) => !seen.has(r.id))];
        });
        if (j.length < PAGE) setExhausted(true);
      })
      .catch(() => setError("Couldn't load more."))
      .finally(() => { busyRef.current = false; });
  }, [history, exhausted, rows]);

  useEffect(() => {
    loadFirst();
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: Product[]) => setProducts(ps))
      .catch(() => {});
    fetch("/api/shops")
      .then((r) => (r.ok ? r.json() : []))
      .then((ss: Shop[]) => setShops(ss))
      .catch(() => {});
  }, [loadFirst]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !history) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, history]);

  function drop(id: number) {
    setRows((rs) => {
      const next = (rs ?? []).filter((r) => r.id !== id);
      onCount?.(next.length);
      return next;
    });
  }

  // swap alternatives per ingredient, indexed once instead of filtered per row
  const altsByIngredient = useMemo(() => {
    const m = new Map<number, Product[]>();
    for (const p of products) {
      const g = m.get(p.ingredientId);
      if (g) g.push(p);
      else m.set(p.ingredientId, [p]);
    }
    return m;
  }, [products]);

  // pending: flat by stop. history: by purchase date, then by stop within the date.
  const stops = useMemo(() => {
    const m = new Map<string, Pending[]>();
    for (const r of rows ?? []) {
      const g = m.get(r.shopName);
      if (g) g.push(r);
      else m.set(r.shopName, [r]);
    }
    return [...m.entries()];
  }, [rows]);

  const dateGroups = useMemo(() => {
    const byDate = new Map<string, Map<string, Pending[]>>();
    for (const r of rows ?? []) {
      const date = r.purchasedAt ? new Date(r.purchasedAt).toLocaleDateString() : "Undated";
      let shops = byDate.get(date);
      if (!shops) byDate.set(date, (shops = new Map()));
      const g = shops.get(r.shopName);
      if (g) g.push(r);
      else shops.set(r.shopName, [r]);
    }
    return [...byDate.entries()].map(([d, shops]) => [d, [...shops.entries()]] as const);
  }, [rows]);

  function renderRow(row: Pending) {
    return (
      <BillRow
        key={row.id}
        row={row}
        history={history}
        alts={altsByIngredient.get(row.ingredientId) ?? []}
        shops={shops}
        // pending: a priced row leaves the list. history: keep it (BillRow holds the edit).
        onSaved={history ? () => {} : () => drop(row.id)}
        onRemoved={() => drop(row.id)}
        onSwapped={loadFirst}
      />
    );
  }

  return (
    <>
      {error && <p className="notice">{error}</p>}
      {rows === null && !error && <p className="loading">Loading…</p>}

      {history && rows !== null && <AddPurchase products={products} onAdded={loadFirst} />}

      {rows && rows.length === 0 && (
        <p className="empty">
          {history ? "No purchases yet." : "Nothing to price — you’re all caught up."}
        </p>
      )}

      {history
        ? dateGroups.map(([date, byShop]) => (
            <section key={date} className="stack">
              <h2 className="eb">{date}</h2>
              {byShop.map(([shopName, group]) => (
                <Ticket key={shopName} shopName={shopName} website={group[0].website} iconUrl={group[0].iconUrl} total={groupTotal(group)}>
                  {group.map(renderRow)}
                </Ticket>
              ))}
            </section>
          ))
        : stops.map(([shopName, group]) => (
            <Ticket key={shopName} shopName={shopName} website={group[0].website} iconUrl={group[0].iconUrl}>
              {group.map(renderRow)}
            </Ticket>
          ))}

      {history && !exhausted && rows !== null && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
    </>
  );
}

function BillRow({
  row,
  history = false,
  alts,
  shops,
  onSaved,
  onRemoved,
  onSwapped,
}: {
  row: Pending;
  history?: boolean;
  alts: Product[];
  shops: Shop[];
  onSaved: () => void;
  onRemoved: () => void;
  onSwapped: () => void;
}) {
  // The field is the TOTAL paid; we store per-unit cents (= total / qty), since
  // that's what the app reuses as the product's price. Prefill = stored unit × qty.
  const [dollars, setDollars] = useState(
    row.hintCents != null ? centsToDollars(row.hintCents * row.quantity).toFixed(2) : "",
  );
  const [expiresAt, setExpiresAt] = useState(row.expiresAt ?? "");
  const [quantity, setQuantity] = useState(String(row.quantity));
  // YYYY-MM-DD (local) for the date input; only editable in the history view.
  const [purchasedAt, setPurchasedAt] = useState(
    row.purchasedAt ? new Date(row.purchasedAt).toLocaleDateString("en-CA") : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickProduct, setPickProduct] = useState(false); // history: name → swap dropdown

  async function save() {
    // History rows may be left unpriced (e.g. you're only fixing the date), so an
    // empty field means "no price yet". The pending bill still requires a price.
    const hasPrice = dollars !== "";
    const amount = Number(dollars);
    if (hasPrice ? !Number.isFinite(amount) || amount < 0 : !history) {
      setError("Enter a price.");
      return;
    }
    const qty = Number(quantity) || 1;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // amount is the total paid; store per-unit cents. ponytail: rounds to the
        // cent, so total/qty that isn't exact loses a cent or two — fine for groceries.
        cents: hasPrice ? Math.round(Math.round(amount * 100) / qty) : null,
        expiresAt: expiresAt || null,
        quantity: qty,
        // only history rows expose the date field; skip it otherwise.
        ...(history && purchasedAt ? { purchasedAt } : {}),
      }),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else setError("Couldn't save.");
  }

  // Bought a different product than planned (the one you wanted was out of stock).
  async function swap(productId: number) {
    if (productId === row.productId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    setBusy(false);
    if (res.ok) onSwapped(); // may move to a different stop → reload regroups
    else setError("Couldn't switch product.");
  }

  // Where you actually bought it (e.g. a generic item grabbed at a specific shop).
  // Changes the stop it groups under, so reload regroups like a product swap.
  async function changeShop(shopId: number) {
    if (shopId === row.shopId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    setBusy(false);
    if (res.ok) onSwapped();
    else setError("Couldn't change shop.");
  }

  // History: each chip commits its own field on blur/Enter (no batch Save button).
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) setError("Couldn't save.");
    return res.ok;
  }
  // total paid → per-unit cents (same rounding as the batch save). "" clears the price.
  const perUnit = (totalStr: string, qty: number) =>
    totalStr === "" ? null : Math.round(Math.round(Number(totalStr) * 100) / qty);
  async function commitPrice(next: string) {
    if (next !== "" && !(Number(next) >= 0)) { setError("Enter a price."); return; }
    setDollars(next);
    await patch({ cents: perUnit(next, Number(quantity) || 1) });
  }
  async function commitQty(next: string) {
    const q = Number(next) || 1;
    setQuantity(String(q));
    // keep the total the user sees stable; re-derive per-unit from it.
    await patch({ quantity: q, cents: perUnit(dollars, q) });
  }
  async function commitExp(next: string) {
    setExpiresAt(next);
    await patch({ expiresAt: next || null });
  }
  async function commitBought(next: string) {
    if (!next) return; // date is required; ignore a cleared field
    setPurchasedAt(next);
    await patch({ purchasedAt: next });
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/purchases/${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onRemoved();
    else setError("Couldn't remove.");
  }

  // History: dense one-purchase-per-line — name + tap-to-edit chip values.
  if (history) {
    const money = dollars === "" ? "—" : dollars;
    return (
      <div className="hrow">
        <div className="hrow-head">
          {pickProduct && alts.length > 1 ? (
            <Dropdown
              label="What did you buy?"
              value={row.productId}
              options={alts.map((p) => ({ id: p.id, label: p.name }))}
              onChange={(id) => { setPickProduct(false); swap(Number(id)); }}
            />
          ) : (
            <button type="button" className="hrow-name" onClick={() => setPickProduct(true)} disabled={alts.length <= 1}>
              {row.productName}
            </button>
          )}
          <button type="button" className="hrow-trash" onClick={remove} disabled={busy} aria-label={`Remove ${row.productName}`}>
            <Trash2 size={15} />
          </button>
        </div>
        <div className="hrow-chips">
          <EditableValue k="$" cls="money" display={money} value={dollars} inputMode="decimal" onCommit={commitPrice} />
          <EditableValue k="×" cls="qty" display={quantity} value={quantity} inputMode="numeric" onCommit={commitQty} />
          <EditableValue k="buy" cls="date" type="date" display={mmdd(purchasedAt)} value={purchasedAt} max={new Date().toLocaleDateString("en-CA")} onCommit={commitBought} />
          <EditableValue k="exp" cls="date" type="date" display={mmdd(expiresAt)} value={expiresAt} onCommit={commitExp} />
          <ShopChip shopId={row.shopId} shopName={row.shopName} website={row.website} iconUrl={row.iconUrl} shops={shops} onChange={changeShop} />
        </div>
        {error && <div className="eb" style={{ color: "var(--paprika)", marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="ticket-row">
      <div className="tk-main">
        {alts.length > 1 ? (
          <Dropdown
            label="What did you buy?"
            value={row.productId}
            options={alts.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(id) => swap(Number(id))}
          />
        ) : (
          <div className="tk-name">
            <Link href={`/manage/products/${row.productId}`}>{row.productName}</Link>
          </div>
        )}

        <div className="bill-fields">
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            $ total
            <input
              className="input mono"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              aria-label={`Total paid for ${row.productName}`}
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
              aria-label={`Quantity of ${row.productName}`}
              style={{ width: 56 }}
            />
          </label>
          {history && (
            <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              bought
              <input
                className="input"
                type="date"
                value={purchasedAt}
                max={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setPurchasedAt(e.target.value)}
                aria-label={`Purchase date of ${row.productName}`}
              />
            </label>
          )}
          <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            exp
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-label={`Expiry of ${row.productName}`}
            />
          </label>
          {shops.length > 1 && (
            <label className="eb" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              shop
              <Dropdown
                value={row.shopId}
                options={shops.map((s) => ({ id: s.id, label: s.name }))}
                onChange={(id) => changeShop(Number(id))}
              />
            </label>
          )}
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Remove ${row.productName} — bought by mistake`}
            style={{ color: "var(--paprika)", display: "inline-flex", alignItems: "center" }}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {error && <div className="eb" style={{ color: "var(--paprika)", marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}

// YYYY-MM-DD → MM/DD for the compact chip; "" → em dash.
export function mmdd(iso: string) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}/${m[2]}` : "—";
}

// A chip that reads as text and turns into an input on tap; commits on blur/Enter, cancels on Esc.
export function EditableValue({
  k, cls, display, value, type = "text", inputMode, max, onCommit,
}: {
  k: string;
  cls: "money" | "qty" | "date";
  display: string;         // what the chip shows when not editing
  value: string;           // raw value seeded into the input
  type?: string;
  inputMode?: "decimal" | "numeric";
  max?: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button type="button" className={`val ${cls}`} onClick={() => { setDraft(value); setEditing(true); }}>
        <span className="k">{k}</span>{display}
      </button>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft); };
  return (
    <input
      className={`val-edit ${cls}`}
      type={type}
      inputMode={inputMode}
      max={max}
      value={draft}
      autoFocus
      aria-label={k}
      onChange={(e) => setDraft(inputMode ? e.target.value.replace(inputMode === "decimal" ? /[^0-9.]/g : /[^0-9]/g, "") : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
      }}
    />
  );
}

// Shop as a tappable chip → the shared Dropdown; picking a shop regroups the row.
function ShopChip({
  shopId, shopName, website, iconUrl, shops, onChange,
}: {
  shopId: number;
  shopName: string;
  website?: string | null;
  iconUrl?: string | null;
  shops: Shop[];
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open && shops.length > 1) {
    return (
      <Dropdown
        value={shopId}
        options={shops.map((s) => ({ id: s.id, label: s.name }))}
        onChange={(id) => { setOpen(false); onChange(Number(id)); }}
      />
    );
  }
  return (
    <button type="button" className="val shop" onClick={() => setOpen(true)} disabled={shops.length <= 1} aria-label={`Shop: ${shopName}`}>
      <Favicon name={shopName} website={website} iconUrl={iconUrl} size={16} />
    </button>
  );
}
