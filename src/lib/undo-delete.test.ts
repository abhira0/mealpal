import { describe, expect, it, vi } from "vitest";
import { scheduleUndo } from "@/lib/undo-delete";

describe("scheduleUndo", () => {
  it("restores the pending occurrence: cancel() before the window elapses skips commit entirely", () => {
    vi.useFakeTimers();
    const commit = vi.fn();

    const cancel = scheduleUndo(commit, 6000);
    vi.advanceTimersByTime(3000);
    const cancelled = cancel();

    // Undo pre-empted the commit — nothing was ever sent, so the row this
    // would have deleted (same event/rule id) is untouched, not recreated.
    expect(cancelled).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("commits once the undo window elapses without a cancel", () => {
    vi.useFakeTimers();
    const commit = vi.fn();

    scheduleUndo(commit, 6000);
    vi.advanceTimersByTime(6000);

    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancel() after commit already fired is a no-op and reports it wasn't pre-empted", () => {
    vi.useFakeTimers();
    const commit = vi.fn();

    const cancel = scheduleUndo(commit, 1000);
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);

    const cancelled = cancel();
    expect(cancelled).toBe(false);
    vi.useRealTimers();
  });
});
