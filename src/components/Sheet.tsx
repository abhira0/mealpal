"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Generic bottom sheet. Hand-built a11y: role=dialog/aria-modal, focus moves
 * into the sheet on open, Escape + scrim-click close, focus returns to the
 * triggering element on close. Reduced-motion is handled in globals.css.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so we can restore it on close.
    triggerRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the sheet.
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? sheet)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && sheet) {
        const items = Array.from(
          sheet.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null || el === sheet);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger when the sheet closes/unmounts.
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal to body so an ancestor's filter/transform (e.g. .ticket's
  // drop-shadow) doesn't become the containing block and unstick bottom:0.
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={sheetRef}
        tabIndex={-1}
      >
        <div className="grab" aria-hidden="true" />
        <div className="sh-title" id={titleId}>
          {title}
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
