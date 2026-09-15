"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toastStore, type ToastItem } from "@/lib/toast-store";

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const api: ToastApi = {
  success: (message) => toastStore.show("success", message),
  error: (message) => toastStore.show("error", message),
};

/**
 * Replaces window.alert() everywhere: a small toast stack portaled to body.
 * Success/info toasts auto-dismiss (see toast-store); errors stay up until
 * the user dismisses them, since they're the ones worth not missing. Native
 * alert() blocks the main thread and iOS Safari silently no-ops it in
 * standalone PWA mode — this has no dependency on window.alert existing.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>(() => toastStore.getItems());
  useEffect(() => toastStore.subscribe(setItems), []);
  // document.body doesn't exist during SSR/prerender — only portal client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="toast-stack">
            {items.map((t) => (
              <div
                key={t.id}
                className={`toast toast-${t.type}`}
                role={t.type === "error" ? "alert" : "status"}
              >
                <span>{t.message}</span>
                <button
                  type="button"
                  className="toast-dismiss"
                  onClick={() => toastStore.dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
