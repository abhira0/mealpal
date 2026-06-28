"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";

// ---------------------------------------------------------------------------
// Shared input styling. globals.css owns the visual tokens but does NOT define
// an `.input` class, so we apply the paper-raised look inline per the spec.
// ---------------------------------------------------------------------------
const inputStyle: React.CSSProperties = {
  background: "var(--paper-raised)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 11,
  width: "100%",
  font: "inherit",
  fontSize: 14,
  color: "var(--ink)",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--sage)",
  display: "block",
  marginBottom: 6,
};

const UNITS = ["g", "ml", "oz", "count"] as const;

type Row = Record<string, unknown> & { id: number | string };

async function getJSON(url: string): Promise<Row[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as Row[]) : [];
}

async function postJSON(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Request failed");
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}
        {optional ? " · optional" : ""}
      </label>
      {children}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={inputStyle} />;
}

function UnitRadio({
  value,
  onChange,
}: {
  value: string;
  onChange: (u: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Unit" style={{ display: "flex", gap: 6 }}>
      {UNITS.map((u) => {
        const on = value === u;
        return (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(u)}
            className="trigger"
            style={{
              justifyContent: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              padding: "10px 0",
              background: on ? "var(--enamel)" : "var(--paper-raised)",
              color: on ? "var(--paper)" : "var(--ink)",
              borderColor: on ? "var(--enamel)" : "var(--line)",
            }}
          >
            {u}
          </button>
        );
      })}
    </div>
  );
}

function Notice({ kind, msg }: { kind: "error" | "ok"; msg: string }) {
  return (
    <p
      style={{
        fontSize: 13,
        margin: "0 0 12px",
        padding: "9px 11px",
        borderRadius: 8,
        background: kind === "error" ? "var(--run-bg)" : "var(--chip-bg)",
        color: kind === "error" ? "var(--run-ink)" : "var(--enamel-dark)",
      }}
    >
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Catalog sub-views: each is a sub-list + create form for one entity kind.
// ---------------------------------------------------------------------------
type View = "ingredients" | "shops" | "products";

const VIEW_LABELS: Record<View, string> = {
  ingredients: "Ingredients",
  shops: "Shops & branches",
  products: "Products & prices",
};

function IngredientForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("g");
  const [servingSize, setServingSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await postJSON("/api/ingredients", {
        name,
        canonicalUnit: unit,
        servingSize: servingSize ? Number(servingSize) : null,
      });
      setName("");
      setServingSize("");
      setUnit("g");
      setOk(true);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <p className="title" style={{ marginBottom: 12 }}>
        New ingredient
      </p>
      {err && <Notice kind="error" msg={err} />}
      {ok && <Notice kind="ok" msg="Ingredient added." />}
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required placeholder="Eggs" />
      </Field>
      <Field label="Unit">
        <UnitRadio value={unit} onChange={setUnit} />
      </Field>
      <Field label="Serving size" optional>
        <TextInput
          type="number"
          step="any"
          min="0"
          value={servingSize}
          onChange={(e) => setServingSize(e.target.value)}
          placeholder={unit}
        />
      </Field>
      <button type="submit" className="btn" style={{ width: "100%" }} disabled={busy || !name}>
        {busy ? "Adding…" : "Add ingredient"}
      </button>
    </form>
  );
}

function ShopBranchForm({
  shops,
  onCreated,
}: {
  shops: Row[];
  onCreated: () => void;
}) {
  // Shop create
  const [shopName, setShopName] = useState("");
  const [shopBusy, setShopBusy] = useState(false);
  const [shopErr, setShopErr] = useState<string | null>(null);
  const [shopOk, setShopOk] = useState(false);

  // Branch create
  const [shopId, setShopId] = useState<string | number | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchErr, setBranchErr] = useState<string | null>(null);
  const [branchOk, setBranchOk] = useState(false);

  async function addShop(e: React.FormEvent) {
    e.preventDefault();
    setShopBusy(true);
    setShopErr(null);
    setShopOk(false);
    try {
      await postJSON("/api/shops", { name: shopName, website: null, iconUrl: null });
      setShopName("");
      setShopOk(true);
      onCreated();
    } catch (e2) {
      setShopErr(e2 instanceof Error ? e2.message : "Couldn't save");
    } finally {
      setShopBusy(false);
    }
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    setBranchBusy(true);
    setBranchErr(null);
    setBranchOk(false);
    try {
      await postJSON("/api/branches", { shopId: Number(shopId), name: branchName });
      setBranchName("");
      setBranchOk(true);
    } catch (e2) {
      setBranchErr(e2 instanceof Error ? e2.message : "Couldn't save");
    } finally {
      setBranchBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={addShop} className="card" style={{ marginBottom: 12 }}>
        <p className="title" style={{ marginBottom: 12 }}>
          New shop
        </p>
        {shopErr && <Notice kind="error" msg={shopErr} />}
        {shopOk && <Notice kind="ok" msg="Shop added." />}
        <Field label="Name">
          <TextInput
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
            placeholder="Trader Joe's"
          />
        </Field>
        <button type="submit" className="btn" style={{ width: "100%" }} disabled={shopBusy || !shopName}>
          {shopBusy ? "Adding…" : "Add shop"}
        </button>
      </form>

      <form onSubmit={addBranch} className="card">
        <p className="title" style={{ marginBottom: 12 }}>
          New branch
        </p>
        {branchErr && <Notice kind="error" msg={branchErr} />}
        {branchOk && <Notice kind="ok" msg="Branch added." />}
        <Field label="Shop">
          <Dropdown
            label="Shop"
            value={shopId}
            onChange={setShopId}
            placeholder={shops.length ? "Select a shop…" : "Add a shop first"}
            options={shops.map((s) => ({ id: s.id, label: String(s.name ?? s.id) }))}
          />
        </Field>
        <Field label="Branch name">
          <TextInput
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            required
            placeholder="Downtown"
          />
        </Field>
        <button
          type="submit"
          className="btn"
          style={{ width: "100%" }}
          disabled={branchBusy || !branchName || shopId == null}
        >
          {branchBusy ? "Adding…" : "Add branch"}
        </button>
      </form>
    </>
  );
}

function ProductForm({
  ingredients,
  shops,
  onCreated,
}: {
  ingredients: Row[];
  shops: Row[];
  onCreated: () => void;
}) {
  const [ingredientId, setIngredientId] = useState<string | number | null>(null);
  const [shopId, setShopId] = useState<string | number | null>(null);
  const [name, setName] = useState("");
  const [packSize, setPackSize] = useState("");
  const [priority, setPriority] = useState("");
  const [dollars, setDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const ingredientUnit = (() => {
    const row = ingredients.find((i) => String(i.id) === String(ingredientId));
    return row?.canonicalUnit != null ? String(row.canonicalUnit) : null;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      // Price (dollars) is accepted directly by product create.
      await postJSON("/api/products", {
        ingredientId: Number(ingredientId),
        shopId: Number(shopId),
        name,
        packSize: packSize ? Number(packSize) : 1,
        priority: priority ? Number(priority) : undefined,
        dollars: dollars ? Number(dollars) : undefined,
      });
      setName("");
      setPackSize("");
      setPriority("");
      setDollars("");
      setOk(true);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <p className="title" style={{ marginBottom: 12 }}>
        New product
      </p>
      {err && <Notice kind="error" msg={err} />}
      {ok && <Notice kind="ok" msg="Product added." />}
      <Field label="Ingredient">
        <Dropdown
          label="Ingredient"
          value={ingredientId}
          onChange={setIngredientId}
          placeholder={ingredients.length ? "Select an ingredient…" : "Add an ingredient first"}
          options={ingredients.map((i) => ({ id: i.id, label: String(i.name ?? i.id) }))}
        />
      </Field>
      <Field label="Shop">
        <Dropdown
          label="Shop"
          value={shopId}
          onChange={setShopId}
          placeholder={shops.length ? "Select a shop…" : "Add a shop first"}
          options={shops.map((s) => ({ id: s.id, label: String(s.name ?? s.id) }))}
        />
      </Field>
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required placeholder="Dozen large eggs" />
      </Field>
      <Field label={`Pack size${ingredientUnit ? ` (${ingredientUnit})` : ""}`}>
        <TextInput
          type="number"
          step="any"
          min="0"
          value={packSize}
          onChange={(e) => setPackSize(e.target.value)}
          placeholder="12"
        />
      </Field>
      <Field label="Priority" optional>
        <TextInput
          type="number"
          step="1"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Price ($)" optional>
        <TextInput
          type="number"
          step="any"
          min="0"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          placeholder="4.99"
        />
      </Field>
      <button
        type="submit"
        className="btn"
        style={{ width: "100%" }}
        disabled={busy || !name || ingredientId == null || shopId == null}
      >
        {busy ? "Adding…" : "Add product"}
      </button>
    </form>
  );
}

function SubList({ view, rows, shops, ingredients }: {
  view: View;
  rows: Row[];
  shops: Row[];
  ingredients: Row[];
}) {
  if (rows.length === 0) {
    return (
      <p className="slot" style={{ padding: "16px 2px" }}>
        Nothing here yet — add the first one above.
      </p>
    );
  }
  const nameOf = (map: Row[], id: unknown) =>
    String(map.find((r) => String(r.id) === String(id))?.name ?? "—");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div className="card" key={String(r.id)} style={{ padding: 12 }}>
          <span className="title" style={{ fontSize: 14 }}>
            {String(r.name ?? r.id)}
          </span>
          <div className="slot" style={{ marginTop: 4 }}>
            {view === "ingredients" &&
              `${String(r.canonicalUnit ?? "")}${r.servingSize != null ? ` · serving ${String(r.servingSize)}` : ""}`}
            {view === "shops" && (r.website ? String(r.website) : "shop")}
            {view === "products" &&
              `${nameOf(ingredients, r.ingredientId)} · ${nameOf(shops, r.shopId)}${
                r.effectiveCents != null ? ` · $${(Number(r.effectiveCents) / 100).toFixed(2)}` : ""
              }`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level: catalog hub rows -> sub-view (list + form). All state-driven, no
// route changes, so it lives entirely inside the files this agent owns.
// ---------------------------------------------------------------------------
export function ManageForms({
  initialCounts,
}: {
  initialCounts: Partial<Record<View, number | null>>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [ingredients, setIngredients] = useState<Row[]>([]);
  const [shops, setShops] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [counts, setCounts] = useState(initialCounts);

  async function refresh() {
    const [ing, sh, pr] = await Promise.all([
      getJSON("/api/ingredients"),
      getJSON("/api/shops"),
      getJSON("/api/products"),
    ]);
    setIngredients(ing);
    setShops(sh);
    setProducts(pr);
    setCounts({ ingredients: ing.length, shops: sh.length, products: pr.length });
  }

  useEffect(() => {
    if (view) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const rowsFor = (v: View) =>
    v === "ingredients" ? ingredients : v === "shops" ? shops : products;

  if (view) {
    return (
      <div style={{ padding: 16 }}>
        <button
          type="button"
          onClick={() => setView(null)}
          className="eb"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--enamel)", marginBottom: 12 }}
        >
          ← Catalog
        </button>
        <h2 className="title" style={{ fontSize: 18, marginBottom: 14 }}>
          {VIEW_LABELS[view]}
        </h2>

        {view === "ingredients" && <IngredientForm onCreated={refresh} />}
        {view === "shops" && <ShopBranchForm shops={shops} onCreated={refresh} />}
        {view === "products" && (
          <ProductForm ingredients={ingredients} shops={shops} onCreated={refresh} />
        )}

        <p className="slot" style={{ margin: "20px 0 8px" }}>
          Existing
        </p>
        <SubList view={view} rows={rowsFor(view)} shops={shops} ingredients={ingredients} />
      </div>
    );
  }

  const ROWS: { view: View; emoji: string }[] = [
    { view: "ingredients", emoji: "🥚" },
    { view: "shops", emoji: "🏬" },
    { view: "products", emoji: "🛒" },
  ];

  return (
    <div style={{ padding: 16 }}>
      <p className="slot" style={{ marginBottom: 8 }}>
        Catalog
      </p>
      <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
        {ROWS.map(({ view: v, emoji }) => {
          const c = counts[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 20 }}>
                {emoji}
              </span>
              <span className="title" style={{ flex: 1, fontSize: 15 }}>
                {VIEW_LABELS[v]}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--sage)" }}>
                {c == null ? "—" : c}
              </span>
              <span aria-hidden="true" style={{ color: "var(--sage)" }}>
                ›
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
