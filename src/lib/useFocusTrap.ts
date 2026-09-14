import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Trap Tab focus inside `ref` while `active`, and move focus in on open.
 * Escape handling and focus-restore stay with the caller (they already have it).
 * Sheet.tsx has its own copy intertwined with scroll-lock — this is for the
 * full-screen portals (CookMode, CommandPalette) that only needed the trap.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    if (!el.contains(document.activeElement)) {
      el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && a === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ref, active]);
}
