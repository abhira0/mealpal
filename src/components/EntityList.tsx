"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ENTITIES, type ColumnDef, type EntitySlug } from "@/app/manage/entities";

type Row = Record<string, unknown> & { id: number | string };
type RefMaps = Record<string, Map<string, string>>;

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load");
  return res.json();
}

export function EntityList({ slug }: { slug: EntitySlug }) {
  const config = ENTITIES[slug];
  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<RefMaps>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Which entities do we need to resolve FK columns to names?
  const refSlugs = useMemo(
    () =>
      Array.from(
        new Set(
          config.columns
            .map((c) => c.refFrom)
            .filter((s): s is EntitySlug => Boolean(s)),
        ),
      ),
    [config.columns],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJSON(config.listPath),
      ...refSlugs.map((s) => getJSON(ENTITIES[s].listPath)),
    ])
      .then(([list, ...refLists]) => {
        if (cancelled) return;
        setRows(Array.isArray(list) ? (list as Row[]) : []);
        const maps: RefMaps = {};
        refSlugs.forEach((s, i) => {
          const data = refLists[i];
          const map = new Map<string, string>();
          if (Array.isArray(data)) {
            for (const item of data as Row[]) {
              map.set(String(item.id), String(item.name ?? item.id));
            }
          }
          maps[s] = map;
        });
        setRefs(maps);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this list yet.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [config.listPath, refSlugs]);

  async function remove(id: string | number) {
    setError(null);
    const res = await fetch(config.itemPath(id), { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? "Couldn't delete this item.");
  }

  function cellValue(row: Row, col: ColumnDef): string {
    if (col.format) return col.format(row);
    const raw = row[col.key];
    if (col.refFrom) {
      const map = refs[col.refFrom];
      const name = map?.get(String(raw ?? ""));
      return name ?? (raw == null ? "—" : String(raw));
    }
    return raw == null || raw === "" ? "—" : String(raw);
  }

  return (
    <main>
      <div className="chrome">
        <p className="eb">Manage</p>
        <h1>{config.label}</h1>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Link href="/manage" className="eb" style={{ color: "var(--enamel)" }}>
            ← Catalog
          </Link>
          <Link
            href={`/manage/${slug}/new`}
            className="btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            + Add {config.singular.toLowerCase()}
          </Link>
        </div>

        {error && (
          <p
            style={{
              fontSize: 13,
              margin: "0 0 12px",
              padding: "9px 11px",
              borderRadius: 8,
              background: "var(--run-bg)",
              color: "var(--run-ink)",
            }}
          >
            {error}
          </p>
        )}

        {loaded && rows.length === 0 && !error && (
          <p className="slot" style={{ padding: "16px 2px" }}>
            No {config.label.toLowerCase()} yet.
          </p>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => {
            const inner = (
              <>
                <span className="title" style={{ fontSize: 14, display: "block" }}>
                  {cellValue(row, config.columns[0])}
                </span>
                {config.columns.slice(1).map((col) => (
                  <span key={col.key} className="slot" style={{ display: "block", marginTop: 3 }}>
                    {col.label}: {cellValue(row, col)}
                  </span>
                ))}
              </>
            );

            return (
              <div key={String(row.id)} className="card" style={{ padding: 12 }}>
                {config.canEdit ? (
                  <Link
                    href={`/manage/${slug}/${row.id}`}
                    style={{ display: "block", color: "inherit", textDecoration: "none" }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{inner}</span>
                    {config.canDelete && (
                      <button
                        type="button"
                        className="btn"
                        style={{ background: "var(--paper-raised)", color: "var(--paprika)", border: "1px solid var(--line)" }}
                        onClick={() => remove(row.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
