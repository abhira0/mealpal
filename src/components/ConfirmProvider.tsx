"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";

type ConfirmOptions = { message: string; confirmLabel?: string; cancelLabel?: string };
type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replaces window.confirm() everywhere: reuses Sheet (so it gets the same
 * focus-move-in/Escape/scrim-click/focus-restore behavior for free) and
 * resolves a promise instead of blocking the main thread. Escape (handled by
 * Sheet) cancels; Enter confirms.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Required<ConfirmOptions> | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const o = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({
        message: o.message,
        confirmLabel: o.confirmLabel ?? "Confirm",
        cancelLabel: o.cancelLabel ?? "Cancel",
      });
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet open={state !== null} title="Confirm" onClose={() => settle(false)}>
        {state && (
          <div
            className="sh-body"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                settle(true);
              }
            }}
          >
            <p className="body">{state.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                {state.cancelLabel}
              </button>
              <button type="button" className="btn" autoFocus onClick={() => settle(true)}>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}
