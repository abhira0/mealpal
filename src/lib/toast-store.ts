// Framework-free toast state, so it's usable outside React (and unit-testable
// with plain vitest — no DOM/jsdom needed) and so ToastProvider is just a thin
// subscriber. Errors are sticky (no auto-dismiss timer); everything else
// clears itself after AUTO_DISMISS_MS.
export type ToastType = "success" | "error";
export type ToastItem = { id: number; type: ToastType; message: string };

export const AUTO_DISMISS_MS = 4000;

type Listener = (items: ToastItem[]) => void;

export function createToastStore() {
  let items: ToastItem[] = [];
  let nextId = 1;
  const listeners = new Set<Listener>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function emit() {
    for (const l of listeners) l(items);
  }

  function dismiss(id: number) {
    if (!items.some((t) => t.id === id)) return;
    items = items.filter((t) => t.id !== id);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    emit();
  }

  function show(type: ToastType, message: string) {
    const id = nextId++;
    items = [...items, { id, type, message }];
    emit();
    if (type !== "error") {
      timers.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    }
    return id;
  }

  function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getItems() {
    return items;
  }

  return { show, dismiss, subscribe, getItems };
}

// Single app-wide store — mirrors the singleton pattern already used for
// simple cross-component state in this codebase (no context needed for the
// data itself, just for handing out the `toast.success/error` API).
export const toastStore = createToastStore();
