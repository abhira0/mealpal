"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

type Item = { key: string; label: string; sub?: string; href: string; group: string };

const NAV: Item[] = [
  { key: "nav-today", label: "Today", href: "/", group: "Go to" },
  { key: "nav-nutrition", label: "Nutrition", href: "/nutrition", group: "Go to" },
  { key: "nav-pantry", label: "Pantry", href: "/pantry", group: "Go to" },
  { key: "nav-shop", label: "Shop", href: "/shop", group: "Go to" },
  { key: "nav-recipes", label: "Recipes", href: "/recipes", group: "Go to" },
  { key: "nav-manage", label: "Manage", href: "/manage", group: "Go to" },
];

async function getJSON(url: string): Promise<unknown[]> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// Load searchable entities once per open-session. Kept minimal: name + id.
async function loadEntities(): Promise<Item[]> {
  const [recipes, ingredients, products, shops] = await Promise.all([
    getJSON("/api/recipes"),
    getJSON("/api/ingredients"),
    getJSON("/api/products"),
    getJSON("/api/shops"),
  ]);
  const R = (rows: unknown[]) => rows as { id: number | string; name?: string }[];
  return [
    ...R(recipes).map((r) => ({ key: `r-${r.id}`, label: r.name ?? String(r.id), href: `/recipes/${r.id}`, group: "Recipes" })),
    ...R(ingredients).map((r) => ({ key: `i-${r.id}`, label: r.name ?? String(r.id), href: `/manage/ingredients/${r.id}`, group: "Ingredients" })),
    ...R(products).map((r) => ({ key: `p-${r.id}`, label: r.name ?? String(r.id), href: `/manage/products/${r.id}`, group: "Products" })),
    ...R(shops).map((r) => ({ key: `s-${r.id}`, label: r.name ?? String(r.id), href: `/manage/shops/${r.id}`, group: "Shops" })),
  ];
}

// Substring match, ranked: earlier match position wins, then shorter label.
function rank(items: Item[], q: string): Item[] {
  if (!q) return NAV;
  const needle = q.toLowerCase();
  return items
    .map((it) => ({ it, pos: it.label.toLowerCase().indexOf(needle) }))
    .filter((x) => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos || a.it.label.length - b.it.label.length)
    .slice(0, 40)
    .map((x) => x.it);
}

export function CommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [entities, setEntities] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const all = useMemo(() => [...NAV, ...entities], [entities]);
  const results = useMemo(() => rank(all, query.trim()), [all, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  // Global ⌘K / Ctrl-K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        triggerRef.current = document.activeElement as HTMLElement | null;
        setActive(0);
        setOpen((v) => !v);
      }
    };
    const onOpen = () => {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setActive(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mealpal:open-cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mealpal:open-cmdk", onOpen);
    };
  }, []);

  // On open: focus the input and lazily load entities once. (active index is
  // reset by the open triggers and by onChange, not here, to avoid setState
  // synchronously inside an effect.)
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (entities.length === 0) loadEntities().then(setEntities);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, entities.length]);

  if (pathname === "/login" || !open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    close();
    router.push(it.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  return createPortal(
    <div className="cmdk-scrim" onMouseDown={close}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmdk-input"
          type="text"
          value={query}
          placeholder="Jump to a page, recipe, ingredient…"
          aria-label="Search"
          aria-controls="cmdk-list"
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
        <ul className="cmdk-list" id="cmdk-list" role="listbox">
          {results.length === 0 && <li className="cmdk-empty">No matches.</li>}
          {results.map((it, i) => {
            const showGroup = i === 0 || results[i - 1].group !== it.group;
            return (
              <li key={it.key} role="option" aria-selected={i === active}>
                {showGroup && <span className="cmdk-group">{it.group}</span>}
                <button
                  type="button"
                  className={i === active ? "cmdk-item on" : "cmdk-item"}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                >
                  <span className="cmdk-label">{it.label}</span>
                  {it.sub && <span className="cmdk-sub">{it.sub}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="cmdk-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
