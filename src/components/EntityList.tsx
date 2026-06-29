"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ENTITIES, type ColumnDef, type EntitySlug, type ListConfig } from "@/app/manage/entities";
import { Favicon } from "@/components/Favicon";

type Row = Record<string, unknown> & { id: number | string };
type RefMaps = Record<string, Map<string, string>>;

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load");
  return res.json();
}

// Generic entities pass `slug` and everything defaults off ENTITIES. Bespoke
// lists (recipes) pass their own config + detailHref + create action, and bump
// reloadToken to refetch after their own form saves.
export function EntityList(props: {
  slug?: EntitySlug;
  config?: ListConfig;
  detailHref?: (row: Row) => string;
  create?: { label: string; href?: string; onClick?: () => void };
  reloadToken?: number;
}) {
  const { slug, reloadToken = 0 } = props;
  const config = props.config ?? ENTITIES[slug!];
  const detailHref = props.detailHref ?? ((row: Row) => `/manage/${slug}/${row.id}`);
  const create = props.create ?? { label: "+ New", href: `/manage/${slug}/new` };
  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<RefMaps>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

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
  }, [config.listPath, refSlugs, reloadToken]);

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

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((row) =>
        config.columns.some((col) => cellValue(row, col).toLowerCase().includes(q)),
      )
    : rows;

  return (
    <>
      <header className="chrome">
        <Link href="/manage" className="chrome-back">← Catalog</Link>
        <h1>{config.label}</h1>
      </header>

      <div className="content stack-sm">
        {error && <p className="notice">{error}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {rows.length > 0 && (
            <div className="search" style={{ flex: 1 }}>
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${config.label.toLowerCase()}`}
                aria-label={`Search ${config.label.toLowerCase()}`}
                className="input"
              />
            </div>
          )}
          {create.href ? (
            <Link
              href={create.href}
              className="btn"
              style={{ flex: rows.length > 0 ? "0 0 auto" : 1, textDecoration: "none" }}
            >
              {create.label}
            </Link>
          ) : (
            <button
              type="button"
              className="btn"
              style={{ flex: rows.length > 0 ? "0 0 auto" : 1 }}
              onClick={create.onClick}
            >
              {create.label}
            </button>
          )}
        </div>

        {loaded && rows.length === 0 && !error && (
          <p className="empty">No {config.label.toLowerCase()} yet.</p>
        )}

        {loaded && rows.length > 0 && shown.length === 0 && (
          <p className="empty">No {config.label.toLowerCase()} match your search.</p>
        )}

        {shown.map((row) => {
          const icon = config.icon?.(row);
          const iconBadge = icon && (
            <span className="icon-badge">
              <Favicon name={icon.name} website={icon.website} iconUrl={icon.iconUrl} size={32} />
            </span>
          );
          // titleTop puts columns[1] as a leading icon next to the title, so its
          // details start at column 2; every other layout details start at 1.
          const detailCols = config.columns.slice(config.titleTop ? 2 : 1);
          const details = detailCols.map((col) => (
            <span key={col.key} className="meta" style={{ display: "block" }}>
              {col.label ? `${col.label}: ` : ""}
              {col.renderCell ? col.renderCell(row) : cellValue(row, col)}
            </span>
          ));

          // titleTop: row1 = [shop icon][title]; row2 = [product image][details].
          const titleTopMain =
            config.titleTop && icon ? (
              <span className="row-main">
                <span style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  {config.columns[1]?.renderCell?.(row)}
                  <span className="title" style={{ fontSize: 15 }}>
                    {cellValue(row, config.columns[0])}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ flex: "0 0 auto" }}>
                    <Favicon name={icon.name} website={icon.website} iconUrl={icon.iconUrl} size={64} />
                  </span>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>{details}</span>
                </span>
              </span>
            ) : null;

          // bigImage: [image][title + details] on one row.
          const main = titleTopMain ??
            (config.bigImage && icon ? (
              <span className="row-main" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ flex: "0 0 auto" }}>
                  <Favicon name={icon.name} website={icon.website} iconUrl={icon.iconUrl} size={64} />
                </span>
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span className="title" style={{ display: "block", fontSize: 15 }}>
                    {cellValue(row, config.columns[0])}
                  </span>
                  {details}
                </span>
              </span>
            ) : (
              <span className="row-main">
                <span className="title" style={{ display: "block", fontSize: 15 }}>
                  {cellValue(row, config.columns[0])}
                </span>
                {details}
              </span>
            ));
          const badge = config.bigImage || config.titleTop ? null : iconBadge;

          return (
            <div key={String(row.id)} className="row">
              {config.canEdit ? (
                <Link href={detailHref(row)} className="row-link">
                  {badge}
                  {main}
                  <ChevronRight className="arrow" size={16} aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <span className="row-link" style={{ cursor: "default" }}>
                    {badge}
                    {main}
                  </span>
                  {config.canDelete && (
                    <button type="button" className="btn-link danger" style={{ width: "auto" }} onClick={() => remove(row.id)}>
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
