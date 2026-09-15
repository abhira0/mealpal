"use client";

/**
 * Minimal cross-page handoff for command-palette "actions" (mealpal-d3f).
 *
 * The palette lives outside any one page's state (MealForm/AddPurchase/the
 * planner all need page-scoped data it doesn't have), so an action navigates
 * to the page that owns the relevant sheet and fires one of these. A listener
 * mounted on that page — which may not exist yet when the event fires, since
 * navigation is async — reacts to it. `sessionStorage` covers that race: the
 * action is persisted right before firing and a page's first effect run
 * checks it before subscribing to live events.
 */
export type CmdkAction =
  | { type: "add-meal" }
  | { type: "log-eaten" }
  | { type: "new-purchase" }
  | { type: "go-to-date"; date: string };

const EVENT = "cmdk:action";
const STORAGE_KEY = "cmdk:pending-action";

export function fireCmdkAction(action: CmdkAction) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  } catch {
    // Storage unavailable (private mode, etc.) — the live event still fires.
  }
  window.dispatchEvent(new CustomEvent<CmdkAction>(EVENT, { detail: action }));
}

/**
 * Call once from a page-level effect. Replays a pending action left by a
 * navigation that raced this listener's mount, then subscribes to live
 * events for as long as the page stays mounted. Returns the unsubscribe fn.
 */
export function consumePendingCmdkAction(onAction: (action: CmdkAction) => void): () => void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      sessionStorage.removeItem(STORAGE_KEY);
      onAction(JSON.parse(raw));
    }
  } catch {
    // Ignore malformed/unavailable storage.
  }
  const listener = (e: Event) => onAction((e as CustomEvent<CmdkAction>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
