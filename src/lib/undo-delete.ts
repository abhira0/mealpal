// Framework-free "optimistic delete + undo window" scheduler — same
// vitest-testable-without-jsdom shape as toast-store.ts. `commit` (the actual
// destructive call) only runs once `delayMs` elapses; calling the returned
// `cancel()` before then skips it entirely, so nothing was ever sent to the
// server and the row it would have deleted is untouched (same id, not a
// recreated row). Returns whether the cancel actually pre-empted the commit.
export function scheduleUndo(commit: () => void, delayMs: number): () => boolean {
  let settled = false;
  const timer = setTimeout(() => {
    settled = true;
    commit();
  }, delayMs);
  return () => {
    if (settled) return false;
    clearTimeout(timer);
    return true;
  };
}
