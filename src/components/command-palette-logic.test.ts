import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  rank,
  recordVisit,
  buildActions,
  getEntities,
  __resetEntitiesCacheForTests,
  __resetRecencyForTests,
  type Item,
} from "./command-palette-logic";

// This repo has no jsdom/testing-library (vitest runs in a plain Node
// environment) and mealpal-d3f explicitly forbids new dependencies, so these
// tests exercise the palette's pure logic directly rather than rendering
// CommandPalette.tsx.

describe("rank (recency)", () => {
  beforeEach(() => __resetRecencyForTests());

  it("returns recently-visited items above same-score non-recent ones", () => {
    // Both match "oat" at pos 0 with the same label length, so without
    // recency this ordering is a tie broken only by input order.
    const tied: Item[] = [
      { key: "i-1", label: "Oat milk", href: "/manage/ingredients/1", group: "Ingredients" },
      { key: "i-2", label: "Oat flour", href: "/manage/ingredients/2", group: "Ingredients" },
    ];
    recordVisit("i-2");
    const results = rank(tied, "oat", []);
    expect(results[0].key).toBe("i-2");
  });

  it("still prefers an earlier substring match over a merely-recent one", () => {
    const items: Item[] = [
      { key: "i-1", label: "Almond milk", href: "/x", group: "Ingredients" }, // "milk" at pos 7
      { key: "i-2", label: "Milk chocolate", href: "/y", group: "Ingredients" }, // "milk" at pos 0
    ];
    recordVisit("i-1"); // recent, but its match position is worse
    const results = rank(items, "milk", []);
    expect(results[0].key).toBe("i-2");
  });

  it("falls back to the given defaults for an empty query", () => {
    const defaults: Item[] = [{ key: "nav-today", label: "Today", href: "/", group: "Go to" }];
    expect(rank([{ key: "x", label: "Anything", href: "/x", group: "G" }], "", defaults)).toBe(defaults);
  });
});

describe("buildActions", () => {
  it("renders an Actions group whose entries invoke the right handler", () => {
    const handlers = {
      addMeal: vi.fn(),
      logEaten: vi.fn(),
      newPurchase: vi.fn(),
      goToDate: vi.fn(),
    };
    const actions = buildActions(handlers);
    expect(actions.every((a) => a.group === "Actions")).toBe(true);
    expect(actions.map((a) => a.label)).toEqual([
      "Add meal",
      "Log eaten",
      "Adjust stock",
      "New purchase",
      "Go to date…",
    ]);

    const addMeal = actions.find((a) => a.label === "Add meal")!;
    addMeal.run?.();
    expect(handlers.addMeal).toHaveBeenCalledTimes(1);
    expect(handlers.logEaten).not.toHaveBeenCalled();

    actions.find((a) => a.label === "Log eaten")!.run?.();
    expect(handlers.logEaten).toHaveBeenCalledTimes(1);

    actions.find((a) => a.label === "New purchase")!.run?.();
    expect(handlers.newPurchase).toHaveBeenCalledTimes(1);

    actions.find((a) => a.label === "Go to date…")!.run?.();
    expect(handlers.goToDate).toHaveBeenCalledTimes(1);

    // "Adjust stock" is plain navigation (to the existing Pantry list, where
    // an ingredient's existing StockAdjust sheet is one tap away) rather than
    // a palette-invoked sheet — it has no `run`, just an href.
    const adjustStock = actions.find((a) => a.label === "Adjust stock")!;
    expect(adjustStock.run).toBeUndefined();
    expect(adjustStock.href).toBe("/pantry");
  });
});

describe("getEntities (session cache)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    __resetEntitiesCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches the four entity endpoints at most once across two simulated opens", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    // @ts-expect-error simplified fetch mock for this test
    global.fetch = fetchMock;

    // "Open" the palette twice — each open calls getEntities().
    await getEntities();
    await getEntities();

    // 4 endpoints (recipes/ingredients/products/shops), not 8.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
