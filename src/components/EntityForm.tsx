"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Favicon, domainFrom } from "@/components/Favicon";
import { convertCanonical } from "@/lib/units";
import { ENTITIES, type EntitySlug, type FieldDef } from "@/app/manage/entities";

type Row = Record<string, unknown> & { id: number | string };
type OptionMap = Record<string, { value: string; label: string }[]>;

// Loose key for matching shop names/slugs/domains: lowercase, alnum only.
// "Patel Brothers" / "patel-brothers" / "patelbros.com" → "patelbrothers" / "patelbros".
const norm = (s: string) => s.toLowerCase().replace(/\.com$/, "").replace(/[^a-z0-9]/g, "");

// Downscale a picked image to a ~64px PNG data URL so we can store it inline
// in the icon_url text column without bloating the row. Favicons are tiny.
function fileToIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 64;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

// Tiny fixed option sets render as an inline radio list instead of a sheet.
const INLINE_RADIO_MAX = 4;

type Purchase = { cents: number; purchasedAt: string };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (d: string) => new Date(d).toLocaleDateString();

// Inline price sparkline, oldest→newest left to right. No chart lib.
// ponytail: points evenly spaced by index, not by date gap — fine for a trend
// glance; switch x to a time scale if uneven gaps start to mislead.
function Sparkline({ history }: { history: Purchase[] }) {
  if (history.length < 2) return null;
  const pts = [...history].reverse().map((h) => h.cents); // chronological
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 280;
  const h = 60;
  const pad = 4;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (c: number) => h - pad - ((c - min) / span) * (h - 2 * pad);
  const d = pts.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Price trend">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((c, i) => (
        <circle key={i} cx={x(i)} cy={y(c)} r={2.5} fill="currentColor" />
      ))}
    </svg>
  );
}

function ProductHistory({ row }: { row: Row }) {
  const history = (row.history as Purchase[] | undefined) ?? [];
  const effective = row.effectiveCents as number | null | undefined;
  return (
    <section className="card stack" style={{ marginTop: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Price history</h2>
      <p style={{ margin: 0 }}>
        Effective price: <strong className="mono">{effective != null ? money(effective) : "—"}</strong>
        {row.priceCents != null ? " (manual override)" : history.length ? " (latest purchase)" : ""}
      </p>
      {history.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.6 }}>No purchases recorded yet.</p>
      ) : (
        <>
          <Sparkline history={history} />
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((p, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: i ? "1px solid var(--line, #0001)" : "none" }}>
                <span>{day(p.purchasedAt)}</span>
                <span className="mono">{money(p.cents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load");
  return res.json();
}

async function sendJSON(url: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Request failed");
  }
  return res.json().catch(() => ({}));
}

export function EntityForm({
  slug,
  id,
  // Embedded: render inside a sheet — no page chrome, and call onDone after a
  // successful save/delete instead of navigating to the list.
  embedded = false,
  onDone,
  // Field values forced on and hidden from the form (e.g. a pre-set ingredient).
  lockedValues,
}: {
  slug: EntitySlug;
  id?: string;
  embedded?: boolean;
  onDone?: () => void;
  lockedValues?: Record<string, string>;
}) {
  const config = ENTITIES[slug];
  const router = useRouter();
  const editing = Boolean(id);
  const done = () => (onDone ? onDone() : router.push(`/manage/${slug}`));

  const [values, setValues] = useState<Record<string, string>>(() => ({ ...lockedValues }));
  const [row, setRow] = useState<Row | null>(null);
  const [options, setOptions] = useState<OptionMap>({});
  const [optionRows, setOptionRows] = useState<Record<string, Row[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onImport() {
    if (!config.importPath) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await sendJSON(config.importPath, "POST", {})) as Record<string, unknown>;

      // Convert the scraped pack size into the chosen ingredient's unit (oz↔g).
      // Without an ingredient picked or across dimensions (ml↔g), keep it as scraped.
      const ingRow = (optionRows.ingredientId ?? []).find((r) => String(r.id) === values.ingredientId);
      const target = ingRow?.canonicalUnit;
      if (typeof target === "string" && typeof data.packSize === "number" && typeof data.unit === "string") {
        const conv = convertCanonical(data.packSize, data.unit, target);
        if (conv != null) data.packSize = Math.round(conv);
      }

      // Auto-select the shop matching any scraped retailer candidate (store slug
      // or JSON-LD seller names), by name or website.
      if (typeof data.shop === "string" && !values.shopId) {
        const keys = data.shop.split("|").map(norm).filter(Boolean);
        const shop = (optionRows.shopId ?? []).find((r) => {
          const name = norm(String(r.name ?? ""));
          const dom = norm(domainFrom(r.website as string | null) ?? "");
          return keys.some((key) => name === key || name.includes(key) || key.includes(name) || (dom !== "" && (dom.includes(key) || key.includes(dom))));
        });
        if (shop) data.shopId = shop.id;
      }

      const fieldNames = new Set(config.fields.map((f) => f.name));
      setValues((v) => {
        const next = { ...v };
        for (const [k, val] of Object.entries(data)) {
          if (fieldNames.has(k) && val != null) next[k] = String(val);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  // Fetch select options from referenced entity list endpoints.
  useEffect(() => {
    let cancelled = false;
    const selectFields = config.fields.filter((f) => f.optionsFrom);
    Promise.all(
      selectFields.map(async (f) => {
        const data = await getJSON(ENTITIES[f.optionsFrom!].listPath).catch(() => []);
        const rows = Array.isArray(data) ? (data as Row[]) : [];
        const opts = rows.map((r) => ({
          value: String(r.id),
          label: String(r[f.optionLabel ?? "name"] ?? r.id),
        }));
        return [f.name, opts, rows] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setOptions(Object.fromEntries(entries.map((e) => [e[0], e[1]])));
      setOptionRows(Object.fromEntries(entries.map((e) => [e[0], e[2]])));
    });
    return () => {
      cancelled = true;
    };
  }, [config.fields]);

  // For edit pages, hydrate current values from the item's row in the list.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getJSON(config.listPath)
      .catch(() => [])
      .then((data) => {
        if (cancelled) return;
        const row = Array.isArray(data)
          ? (data as Row[]).find((r) => String(r.id) === id)
          : undefined;
        if (!row) return;
        setRow(row);
        const next: Record<string, string> = {};
        for (const f of config.fields) {
          if (f.prefill) {
            next[f.name] = f.prefill(row);
            continue;
          }
          const v = row[f.name];
          if (v != null) next[f.name] = String(v);
        }
        setValues(next);
      });
    return () => {
      cancelled = true;
    };
  }, [id, config.listPath, config.fields]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing && id) {
        await sendJSON(config.itemPath(id), "PATCH", config.toUpdatePayload(values));
      } else {
        await sendJSON(config.listPath, "POST", config.toCreatePayload(values));
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!id) return;
    setBusy(true);
    setError(null);
    const res = await fetch(config.itemPath(id), { method: "DELETE" });
    if (res.ok) {
      done();
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? "Couldn't delete this item.");
    setBusy(false);
  }

  function selectOptions(f: FieldDef): { value: string; label: string }[] {
    if (f.optionsFrom) return options[f.name] ?? [];
    return (f.options ?? []).map((o) => ({ value: o, label: o }));
  }

  // Unit to show beside a number field, read off the row selected in another
  // field (e.g. pack size's unit = the chosen ingredient's canonicalUnit).
  function unitFor(f: FieldDef): string | null {
    if (!f.unitFrom) return null;
    const selected = values[f.unitFrom.field];
    if (!selected) return null;
    const row = (optionRows[f.unitFrom.field] ?? []).find((r) => String(r.id) === selected);
    const u = row?.[f.unitFrom.attr];
    return u != null ? String(u) : null;
  }

  function set(name: string, val: string) {
    setValues((v) => ({ ...v, [name]: val }));
  }

  function renderControl(f: FieldDef) {
    const opts = selectOptions(f);

    // Inline radio list for tiny fixed sets (e.g. unit g/ml/oz/count).
    if (f.type === "select" && !f.optionsFrom && opts.length > 0 && opts.length <= INLINE_RADIO_MAX) {
      return (
        <div className="unit-radio" role="radiogroup" aria-label={f.label}>
          {opts.map((o) => {
            const on = values[f.name] === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-pressed={on}
                onClick={() => set(f.name, o.value)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }

    // Icon: show the current icon (or the website-derived favicon fallback)
    // with an upload/replace button laid over it; clicking opens the picker.
    if (f.type === "file") {
      const has = Boolean(values[f.name]);
      return (
        <div className="icon-upload" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <span style={{ position: "relative", width: 72, height: 72, cursor: "pointer", flexShrink: 0 }}>
            <Favicon name={values.name ?? ""} website={values.website} iconUrl={values[f.name]} size={72} />
            <span
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                fontSize: 11,
                fontWeight: 600,
                textAlign: "center",
                color: "#fff",
                background: "rgba(0,0,0,.6)",
                padding: "2px 0",
                borderRadius: "0 0 6px 6px",
              }}
            >
              {has ? "Replace" : "Upload"}
            </span>
          </span>
          <input
            id={f.name}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                set(f.name, await fileToIcon(file));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't read that image");
              }
            }}
          />
          {has && (
            <button type="button" className="btn-link" style={{ width: "auto" }} onClick={(e) => { e.preventDefault(); set(f.name, ""); }}>
              Remove
            </button>
          )}
        </div>
      );
    }

    // Everything else select-like uses the custom Dropdown (no native select).
    if (f.type === "select") {
      return (
        <Dropdown
          label={f.label}
          value={values[f.name] ?? null}
          onChange={(v) => set(f.name, String(v))}
          options={opts.map((o) => ({ id: o.value, label: o.label }))}
        />
      );
    }

    return (
      <input
        id={f.name}
        className={f.type === "number" ? "input mono" : "input"}
        type={f.type}
        step={f.type === "number" ? "any" : undefined}
        value={values[f.name] ?? ""}
        onChange={(e) => set(f.name, e.target.value)}
      />
    );
  }

  const visibleFields = config.fields.filter((f) => !(lockedValues && f.name in lockedValues));

  return (
    <>
      {!embedded && (
        <header className="chrome">
          <Link href={`/manage/${slug}`} className="chrome-back">← {config.label}</Link>
          <h1>
            {editing ? "Edit" : "New"} {config.singular.toLowerCase()}
          </h1>
        </header>
      )}

      <div className={embedded ? "stack" : "content"}>
        {error && <p className="notice" style={{ marginBottom: 12 }}>{error}</p>}

        <form onSubmit={onSubmit} className="card stack">
          {config.importPath && !editing && (
            <button type="button" className="trigger add" disabled={busy} onClick={onImport}>
              {busy ? "…" : "Import from site"}
            </button>
          )}

          {values.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.imageUrl} alt="" style={{ display: "block", maxHeight: 160, borderRadius: 8, margin: "0 auto" }} />
          )}

          {visibleFields.map((f) => (
            <label className="field" key={f.name} htmlFor={f.name}>
              <span className="field-label">
                {f.label}
                {unitFor(f) ? ` (${unitFor(f)})` : ""}
                {f.optional ? " · optional" : ""}
              </span>
              {renderControl(f)}
            </label>
          ))}

          <button type="submit" className="btn block" disabled={busy}>
            {busy ? "…" : editing ? "Save changes" : `Add ${config.singular.toLowerCase()}`}
          </button>

          {editing && config.canDelete && (
            <button
              type="button"
              className="btn-link danger"
              onClick={onDelete}
              disabled={busy}
            >
              Delete {config.singular.toLowerCase()}
            </button>
          )}
        </form>

        {editing && slug === "products" && row && <ProductHistory row={row} />}
      </div>
    </>
  );
}
