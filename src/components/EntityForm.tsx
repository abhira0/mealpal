"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { ENTITIES, type EntitySlug, type FieldDef } from "@/app/manage/entities";

type Row = Record<string, unknown> & { id: number | string };
type OptionMap = Record<string, { value: string; label: string }[]>;

// Tiny fixed option sets render as an inline radio list instead of a sheet.
const INLINE_RADIO_MAX = 4;

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

export function EntityForm({ slug, id }: { slug: EntitySlug; id?: string }) {
  const config = ENTITIES[slug];
  const router = useRouter();
  const editing = Boolean(id);

  const [values, setValues] = useState<Record<string, string>>({});
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
      router.push(`/manage/${slug}`);
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
      router.push(`/manage/${slug}`);
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

  return (
    <>
      <header className="chrome">
        <Link href={`/manage/${slug}`} className="chrome-back">← {config.label}</Link>
        <h1>
          {editing ? "Edit" : "New"} {config.singular.toLowerCase()}
        </h1>
      </header>

      <div className="content">
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

          {config.fields.map((f) => (
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
      </div>
    </>
  );
}
