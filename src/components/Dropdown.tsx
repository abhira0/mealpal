"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type OptionId = string | number;
type Option = { id: OptionId; label: string };

type DropdownProps = {
  label?: string;
  value: OptionId | null;
  options: Option[];
  placeholder?: string;
  onChange: (id: OptionId) => void;
};

const ROW_H = 46; // px per option, for the flip estimate

/**
 * Custom select: a popover anchored at the trigger. Portaled to document.body
 * with position:fixed at the trigger's rect, so it escapes any overflow/filter
 * clipping (e.g. .ticket's drop-shadow) and modal sheets. Opens downward, flips
 * up when there's no room below. Arrow/Enter navigable, outside-click + Esc close.
 */
export function Dropdown({
  label,
  value,
  options,
  placeholder = "Select…",
  onChange,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;
  // Show a filter box only for long lists; short ones don't need it.
  const searchable = options.length > 8;
  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const selectedIndex = selected ? options.findIndex((o) => o.id === selected.id) : 0;
  const [active, setActive] = useState(Math.max(0, selectedIndex));
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Track the trigger's position while open (reposition on scroll/resize).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function openMenu() {
    setQuery("");
    setActive(Math.max(0, selectedIndex)); // start on the selected row
    setOpen(true);
  }

  // Focus the filter box when a searchable menu opens.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Close on outside mousedown / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(id: OptionId) {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else if (shown.length) setActive((i) => (i + 1) % shown.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setActive((i) => (i - 1 + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && shown[active]) commit(shown[active].id);
      else openMenu();
    }
  }

  // Flip up when the estimated panel won't fit below but fits above.
  const panelH = Math.min(shown.length, 6) * ROW_H + (searchable ? 52 : 2);
  const flipUp =
    rect != null &&
    rect.bottom + 6 + panelH > window.innerHeight &&
    rect.top - 6 - panelH > 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={open ? "trigger open" : "trigger"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? undefined : "placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          className="dropdown-pop"
          role="listbox"
          aria-label={label ?? "Options"}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...(flipUp
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.bottom + 6 }),
          }}
        >
          {searchable && (
            <input
              ref={searchRef}
              className="input dropdown-search"
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          )}
          {shown.length === 0 && <div className="dropdown-empty">No matches</div>}
          {shown.map((o, i) => {
            const isSelected = o.id === value;
            return (
              <button
                type="button"
                key={String(o.id)}
                className="o"
                role="option"
                aria-selected={isSelected}
                data-active={i === active ? "true" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.id)}
              >
                <span>{o.label}</span>
                {isSelected ? <span className="tick" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
