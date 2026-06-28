"use client";

import { useCallback, useEffect, useState } from "react";

type Ingredient = { id: number; name: string; canonicalUnit: string };
type Shop = { id: number; name: string };
type Branch = { id: number; name: string; shopId: number };

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Request failed");
  }
  return res.json();
}

export function ManageForms() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedShop, setSelectedShop] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [ing, shp] = await Promise.all([
      fetch("/api/ingredients").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/shops").then((r) => (r.ok ? r.json() : [])),
    ]);
    setIngredients(Array.isArray(ing) ? ing : []);
    setShops(Array.isArray(shp) ? shp : []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedShop) {
      setBranches([]);
      return;
    }
    fetch(`/api/branches?shopId=${selectedShop}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((b) => setBranches(Array.isArray(b) ? b : []))
      .catch(() => setBranches([]));
  }, [selectedShop]);

  function flash(text: string) {
    setMsg(text);
    setErr(null);
    setTimeout(() => setMsg(null), 2500);
  }
  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Something went wrong");
  }

  return (
    <main className="app-main">
      <div className="page-header">
        <p className="eyebrow">Manage</p>
        <h1>Catalog &amp; cold start</h1>
      </div>

      {msg && <p className="caption" style={{ color: "var(--enamel)" }}>{msg}</p>}
      {err && <p className="error">{err}</p>}

      <Section title="New ingredient">
        <Form
          fields={[
            { name: "name", label: "Name", type: "text" },
            {
              name: "canonicalUnit",
              label: "Unit",
              type: "select",
              options: ["g", "ml", "oz", "count"],
            },
            { name: "servingSize", label: "Serving size (optional)", type: "number" },
          ]}
          submitLabel="Add ingredient"
          onSubmit={async (v) => {
            await postJSON("/api/ingredients", {
              name: v.name,
              canonicalUnit: v.canonicalUnit,
              servingSize: v.servingSize ? Number(v.servingSize) : null,
            });
            flash("Ingredient added");
            refresh();
          }}
          onError={fail}
        />
      </Section>

      <Section title="New shop">
        <Form
          fields={[{ name: "name", label: "Shop name", type: "text" }]}
          submitLabel="Add shop"
          onSubmit={async (v) => {
            await postJSON("/api/shops", { name: v.name });
            flash("Shop added");
            refresh();
          }}
          onError={fail}
        />
      </Section>

      <Section title="New branch">
        <div className="field">
          <label>Shop</label>
          <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
            <option value="">Choose a shop…</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {branches.length > 0 && (
          <p className="caption">
            Existing: {branches.map((b) => b.name).join(", ")}
          </p>
        )}
        <Form
          fields={[{ name: "name", label: "Branch name", type: "text" }]}
          submitLabel="Add branch"
          disabled={!selectedShop}
          onSubmit={async (v) => {
            await postJSON("/api/branches", { shopId: Number(selectedShop), name: v.name });
            flash("Branch added");
            setSelectedShop((s) => s);
            fetch(`/api/branches?shopId=${selectedShop}`)
              .then((r) => (r.ok ? r.json() : []))
              .then((b) => setBranches(Array.isArray(b) ? b : []));
          }}
          onError={fail}
        />
      </Section>

      <Section title="New product">
        <Form
          fields={[
            {
              name: "ingredientId",
              label: "Ingredient",
              type: "select",
              options: ingredients.map((i) => ({ value: String(i.id), label: i.name })),
            },
            {
              name: "shopId",
              label: "Shop",
              type: "select",
              options: shops.map((s) => ({ value: String(s.id), label: s.name })),
            },
            { name: "name", label: "Product name", type: "text" },
            { name: "packSize", label: "Pack size", type: "number" },
            { name: "url", label: "URL (optional)", type: "text" },
          ]}
          submitLabel="Add product"
          onSubmit={async (v) => {
            await postJSON("/api/products", {
              ingredientId: Number(v.ingredientId),
              shopId: Number(v.shopId),
              name: v.name,
              packSize: Number(v.packSize) || 1,
              url: v.url || undefined,
            });
            flash("Product added");
          }}
          onError={fail}
        />
      </Section>

      <Section title="Record a product price">
        <Form
          fields={[
            { name: "productId", label: "Product ID", type: "number" },
            { name: "dollars", label: "Price ($)", type: "number" },
          ]}
          submitLabel="Save price"
          onSubmit={async (v) => {
            await postJSON(`/api/products/${Number(v.productId)}/price`, {
              dollars: Number(v.dollars),
            });
            flash("Price recorded");
          }}
          onError={fail}
        />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  options?: (string | { value: string; label: string })[];
};

function Form({
  fields,
  submitLabel,
  onSubmit,
  onError,
  disabled,
}: {
  fields: FieldDef[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onError: (e: unknown) => void;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(values);
          setValues({});
          (e.target as HTMLFormElement).reset();
        } catch (err) {
          onError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <div className="field" key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          {f.type === "select" ? (
            <select
              id={f.name}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            >
              <option value="">Choose…</option>
              {(f.options ?? []).map((o) => {
                const value = typeof o === "string" ? o : o.value;
                const label = typeof o === "string" ? o : o.label;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              id={f.name}
              type={f.type}
              step={f.type === "number" ? "any" : undefined}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || disabled}>
        {busy ? "…" : submitLabel}
      </button>
    </form>
  );
}
