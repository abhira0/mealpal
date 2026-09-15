// Pure, DOM-light logic for CommandPalette.tsx, split out so it's unit
// testable without React or a browser (this repo has no jsdom/testing-library
// and mealpal-d3f asked for no new dependencies).

export type Item = {
  key: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  /** Actions run instead of navigating; the palette calls this and stops. */
  run?: () => void;
  /** Action stays within the palette (e.g. switches it into date-entry mode) instead of closing it. */
  keepOpen?: boolean;
};

export const NAV: Item[] = [
  { key: "nav-today", label: "Today", href: "/", group: "Go to" },
  { key: "nav-plan", label: "Plan", href: "/plan", group: "Go to" },
  { key: "nav-nutrition", label: "Nutrition", href: "/nutrition", group: "Go to" },
  { key: "nav-pantry", label: "Pantry", href: "/pantry", group: "Go to" },
  { key: "nav-shop", label: "Shop", href: "/shop", group: "Go to" },
  { key: "nav-recipes", label: "Recipes", href: "/recipes", group: "Go to" },
  { key: "nav-manage", label: "Manage", href: "/manage", group: "Go to" },
];

/** Groups that hold real, recency-trackable entities (as opposed to nav/actions). */
export const ENTITY_GROUPS = new Set(["Recipes", "Ingredients", "Products", "Shops"]);

async function getJSON(url: string): Promise<unknown[]> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// Load searchable entities. Kept minimal: name + id.
async function loadEntities(): Promise<Item[]> {
  const [recipes, ingredients, products, shops] = await Promise.all([
    getJSON("/api/recipes"),
    getJSON("/api/ingredients"),
    getJSON("/api/products"),
    getJSON("/api/shops"),
  ]);
  const R = (rows: unknown[]) => rows as { id: number | string; name?: string }[];
  return [
    ...R(recipes).map((r) => ({ key: `r-${r.id}`, label: r.name ?? String(r.id), href: `/recipes/${r.id}`, group: "Recipes" })),
    ...R(ingredients).map((r) => ({ key: `i-${r.id}`, label: r.name ?? String(r.id), href: `/manage/ingredients/${r.id}`, group: "Ingredients" })),
    ...R(products).map((r) => ({ key: `p-${r.id}`, label: r.name ?? String(r.id), href: `/manage/products/${r.id}`, group: "Products" })),
    ...R(shops).map((r) => ({ key: `s-${r.id}`, label: r.name ?? String(r.id), href: `/manage/shops/${r.id}`, group: "Shops" })),
  ];
}

// Fetched at most once per page session (module-level cached promise), reused
// across every palette open instead of refetching four endpoints each time.
let entitiesPromise: Promise<Item[]> | null = null;
export function getEntities(): Promise<Item[]> {
  if (!entitiesPromise) entitiesPromise = loadEntities();
  return entitiesPromise;
}
/** Test-only: undo the module-level cache between scenarios. */
export function __resetEntitiesCacheForTests() {
  entitiesPromise = null;
}

// --- Recency of visited entities (localStorage; falls back to an in-memory
// list when localStorage isn't available, e.g. under a plain Node test run). ---
const RECENT_KEY = "cmdk:recent-entities";
const RECENT_CAP = 20;
let memoryRecents: string[] = [];

function readRecents(): string[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    }
  } catch {
    // fall through to memory
  }
  return memoryRecents;
}

function writeRecents(keys: string[]) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RECENT_KEY, JSON.stringify(keys));
      return;
    }
  } catch {
    // fall through to memory
  }
  memoryRecents = keys;
}

/** Record that an entity (by Item.key) was just visited. Call on selection, not on every open. */
export function recordVisit(key: string) {
  const cur = readRecents().filter((k) => k !== key);
  cur.unshift(key);
  writeRecents(cur.slice(0, RECENT_CAP));
}

/** Higher = more recently visited; -1 means never (or no longer within the cap). */
export function recencyOf(key: string): number {
  const idx = readRecents().indexOf(key);
  return idx < 0 ? -1 : RECENT_CAP - idx;
}

/** Test-only: clear recorded recency between scenarios. */
export function __resetRecencyForTests() {
  memoryRecents = [];
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

// Substring match, ranked: earlier match position wins, then recency of visit,
// then shorter label. `defaults` is what's shown for an empty query.
export function rank(items: Item[], query: string, defaults: Item[]): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return defaults;
  return items
    .map((it) => ({ it, pos: it.label.toLowerCase().indexOf(q) }))
    .filter((x) => x.pos >= 0)
    .sort(
      (a, b) =>
        a.pos - b.pos ||
        recencyOf(b.it.key) - recencyOf(a.it.key) ||
        a.it.label.length - b.it.label.length,
    )
    .slice(0, 40)
    .map((x) => x.it);
}

export type ActionHandlers = {
  addMeal: () => void;
  logEaten: () => void;
  newPurchase: () => void;
  goToDate: () => void;
};

// The "do things, not just navigate" verb set (mealpal-d3f). Each opens an
// existing sheet on the page that owns it — see cmdk-bus.ts for how.
export function buildActions(h: ActionHandlers): Item[] {
  return [
    { key: "action-add-meal", label: "Add meal", href: "", group: "Actions", run: h.addMeal },
    { key: "action-log-eaten", label: "Log eaten", href: "", group: "Actions", run: h.logEaten },
    { key: "action-adjust-stock", label: "Adjust stock", href: "/pantry", group: "Actions" },
    { key: "action-new-purchase", label: "New purchase", href: "", group: "Actions", run: h.newPurchase },
    { key: "action-go-to-date", label: "Go to date…", href: "", group: "Actions", run: h.goToDate, keepOpen: true },
  ];
}
