"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";

type OptionId = string | number;
type Option = { id: OptionId; label: string };

type DropdownProps = {
  label?: string;
  value: OptionId | null;
  options: Option[];
  placeholder?: string;
  onChange: (id: OptionId) => void;
};

/**
 * Custom select built on the bottom Sheet. No native <select>.
 * Trigger shows the selected label (or placeholder) + caret; opening lists
 * the options with aria-selected + ✓ on the current one. Arrow/Enter
 * navigable inside the sheet.
 */
export function Dropdown({
  label,
  value,
  options,
  placeholder = "Select…",
  onChange,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? null;

  const selectedIndex = selected
    ? options.findIndex((o) => o.id === selected.id)
    : 0;
  const [active, setActive] = useState(Math.max(0, selectedIndex));
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setActive(Math.max(0, selectedIndex));
  }, [open, selectedIndex]);

  function commit(id: OptionId) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(options[active].id);
    }
  }

  return (
    <>
      <button
        type="button"
        className="trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={selected ? undefined : "placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      <Sheet open={open} title={label ?? "Select"} onClose={() => setOpen(false)}>
        <div
          ref={rowsRef}
          role="listbox"
          aria-label={label ?? "Options"}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {options.map((o, i) => {
            const isSelected = o.id === value;
            return (
              <button
                type="button"
                key={String(o.id)}
                className="o"
                role="option"
                aria-selected={isSelected}
                data-active={i === active ? "true" : undefined}
                onClick={() => commit(o.id)}
              >
                <span>{o.label}</span>
                {isSelected ? <span className="tick" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
