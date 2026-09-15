import { describe, expect, it, vi } from "vitest";
import { AUTO_DISMISS_MS, createToastStore } from "@/lib/toast-store";

describe("toast-store", () => {
  it("auto-dismisses a success toast after AUTO_DISMISS_MS", () => {
    vi.useFakeTimers();
    const store = createToastStore();
    store.show("success", "Saved");
    expect(store.getItems()).toHaveLength(1);

    vi.advanceTimersByTime(AUTO_DISMISS_MS - 1);
    expect(store.getItems()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(store.getItems()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("keeps an error toast sticky past the auto-dismiss window", () => {
    vi.useFakeTimers();
    const store = createToastStore();
    store.show("error", "Could not cook.");

    vi.advanceTimersByTime(AUTO_DISMISS_MS * 5);
    expect(store.getItems()).toHaveLength(1);
    vi.useRealTimers();
  });

  it("dismiss() removes an error toast on demand", () => {
    const store = createToastStore();
    const id = store.show("error", "Nope");
    store.dismiss(id);
    expect(store.getItems()).toHaveLength(0);
  });

  it("notifies subscribers on show and dismiss", () => {
    const store = createToastStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((items) => seen.push(items.length));

    const id = store.show("success", "Hi");
    store.dismiss(id);
    unsubscribe();

    expect(seen).toEqual([1, 0]);
  });
});
