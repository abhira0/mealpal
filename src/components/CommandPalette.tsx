"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { fireCmdkAction } from "@/lib/cmdk-bus";
import { ENTITY_GROUPS, NAV, buildActions, getEntities, rank, recordVisit, type Item } from "@/components/command-palette-logic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function CommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [entities, setEntities] = useState<Item[]>([]);
  const [dateMode, setDateMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setDateMode(false);
    triggerRef.current?.focus();
  }, []);

  // The verb set (mealpal-d3f): each opens an existing sheet on the page that
  // owns it, via cmdk-bus, instead of the palette navigating-only. `go()`
  // below handles closing the palette (or not, for "Go to date…") — these
  // handlers just do the navigation/event side of it.
  const actions = useMemo(
    () =>
      buildActions({
        addMeal: () => { router.push("/"); fireCmdkAction({ type: "add-meal" }); },
        logEaten: () => { router.push("/"); fireCmdkAction({ type: "log-eaten" }); },
        newPurchase: () => { router.push("/shop"); fireCmdkAction({ type: "new-purchase" }); },
        goToDate: () => { setQuery(""); setActive(0); setDateMode(true); },
      }),
    [router],
  );

  const defaults = useMemo(() => [...actions, ...NAV], [actions]);
  const all = useMemo(() => [...actions, ...NAV, ...entities], [actions, entities]);
  const results = useMemo(() => (dateMode ? [] : rank(all, query, defaults)), [all, query, defaults, dateMode]);

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
    window.addEventListener("platr:open-cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("platr:open-cmdk", onOpen);
    };
  }, []);

  // On open: focus the input and lazily load entities once. (active index is
  // reset by the open triggers and by onChange, not here, to avoid setState
  // synchronously inside an effect.)
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (entities.length === 0) getEntities().then(setEntities);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, entities.length]);

  // Keep the highlighted row visible as arrow keys move it past the
  // scrollable list's edge (up to 40 results can overflow the panel height).
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  if (pathname === "/login" || !open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    if (it.run) {
      if (!it.keepOpen) close();
      it.run();
      return;
    }
    if (ENTITY_GROUPS.has(it.group)) recordVisit(it.key);
    close();
    router.push(it.href);
  };

  const submitDate = () => {
    const v = query.trim();
    if (!DATE_RE.test(v)) return;
    close();
    router.push("/plan");
    fireCmdkAction({ type: "go-to-date", date: v });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dateMode) {
      if (e.key === "Enter") { e.preventDefault(); submitDate(); }
      else if (e.key === "Escape") { e.preventDefault(); setDateMode(false); setQuery(""); }
      return;
    }
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
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmdk-input"
          type={dateMode ? "date" : "text"}
          value={query}
          placeholder={dateMode ? "Pick a date…" : "Jump to a page, recipe, ingredient…"}
          aria-label={dateMode ? "Date" : "Search"}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `cmdk-opt-${results[active].key}` : undefined}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
        <ul className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {dateMode && <li className="cmdk-empty">Pick a date, then press ↵. Esc to go back.</li>}
          {!dateMode && results.length === 0 && <li className="cmdk-empty">No matches.</li>}
          {results.map((it, i) => {
            const showGroup = i === 0 || results[i - 1].group !== it.group;
            return (
              <li key={it.key} id={`cmdk-opt-${it.key}`} role="option" aria-selected={i === active}>
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
