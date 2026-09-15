"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayISO, toISODate, localNoon } from "@/lib/dates";
import { consumePendingCmdkAction } from "@/lib/cmdk-bus";

export type Slot = { id: number; name: string; timeOfDay: string };
export type Recipe = { id: number; name: string; baseServings: number };
export type Product = { id: number; name: string; servingSize: number | null; canonicalUnit: string };
export type Ingredient = { id: number; name: string; canonicalUnit: string };

export type ItemKind = "recipe" | "product" | "ingredient";
// One line of a meal being composed in the Add sheet. A meal is just a
// collection of these. `servings` drives recipe/product; `amount` is canonical
// units (e.g. grams) for an ingredient, or an optional override for a product.
export type MealItem = { kind: ItemKind; refId: number | null; servings: number; amount: string };
// Legacy alias kept for the batch-edit path (recipe|product only).
export type PackItem = { kind: "recipe" | "product"; refId: number | null; amount: string };

export type AddKind = "recipe" | "product" | "ingredient" | "batch";

// The request body for one meal item, shared by submitAdd and its test.
export function mealItemBody(it: MealItem): Record<string, unknown> {
  if (it.kind === "recipe") return { recipeId: it.refId, servings: it.servings };
  if (it.kind === "product") {
    const amount = it.amount !== "" ? Number(it.amount) : undefined;
    return amount != null
      ? { productId: it.refId, amount }
      : { productId: it.refId, servings: it.servings };
  }
  return { ingredientId: it.refId, amount: Number(it.amount) };
}

// Compact identity of a recurrence, for "did the cadence change?" comparisons.
function recurrenceKey(intervalN: number, unit: string, daysOfWeek: string, untilDate: string) {
  return `${intervalN}|${unit}|${daysOfWeek}|${untilDate}`;
}

// Default item for a freshly-chosen kind (used by the builder's kind toggle).
export function defaultMealItem(
  kind: ItemKind,
  refs: { recipes: Recipe[]; products: Product[]; ingredients: Ingredient[] },
): MealItem {
  if (kind === "recipe")
    return { kind, refId: refs.recipes[0]?.id ?? null, servings: refs.recipes[0]?.baseServings ?? 2, amount: "" };
  if (kind === "product")
    return { kind, refId: refs.products[0]?.id ?? null, servings: 2, amount: "" };
  return { kind, refId: refs.ingredients[0]?.id ?? null, servings: 1, amount: "" };
}

export type AgendaMeal = {
  eventId: number | null; // null for a synthetic batch-projected row (no meal_event backs it)
  slotId: number;
  slotName: string;
  name: string;
  recipeId: number | null;
  productId: number | null;
  ingredientId: number | null;
  status: "planned" | "cooked" | "served";
  phase: "planned" | "cooked" | "served";
  cookedAhead: boolean;
  batchBacked: boolean;
  batchId: number | null;
  mealsRemaining: number | null;
  eatenFromBatchToday: boolean;
  ruleId: number | null;
  outOfStock: boolean;
  missingItems: string[];
};
export type CookFlag = { slotId: number; slotName: string; label: string };
export type AgendaDay = { date: string; meals: AgendaMeal[]; cookFlags: CookFlag[]; eatenCount: number; totalCount: number };
export type NextCook = { slotId: number; slotName: string; label: string; cookDate: string; daysAway: number };
export type AgendaResponse = { days: AgendaDay[]; nextCooks: NextCook[] };
// Which product/variant a meal's ingredient could be served as (from GET .../cook).
export type CookChoice = {
  ingredientId: number;
  ingredientName: string;
  products: { id: number; name: string; onHand: number; variants: { id: number; name: string }[] }[];
};
export type CookPick = { productId: number; variantId: number | null };

// Subset of GET /api/nutrition/analysis?mode=day&date=... used here — eaten
// ("nutrients") vs planned ("planned") totals, scaled to the household goal.
export type DayAnalysis = {
  goals: { calorieGoal: number; proteinG: number; carbsG: number; fatG: number };
  nutrients: { calories: number; proteinG: number; carbsG: number; fatG: number };
  planned: { calories: number; proteinG: number; carbsG: number; fatG: number };
  // Macro calorie split (percentages), from macroSplit() in the analysis route —
  // used to feed CalorieMacroRing on the desktop dashboard.
  macros: { carbs: number; fat: number; protein: number };
};

export function addDays(date: string, n: number): string {
  return toISODate(new Date(localNoon(date).getTime() + n * 86_400_000));
}

/**
 * All state, data loading, and mutation/handler logic for the Today page.
 * Behavior-identical to the original monolithic TodayAgenda component; the
 * mobile and desktop views both consume this so their actions stay in sync.
 */
export function useAgenda(
  userName?: string | null,
  range?: { from?: string; to?: string },
) {
  // ponytail: server can't know the client's date/timezone, so all
  // time-derived text is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [todayIso, setTodayIso] = useState(todayISO);
  // A tab left open past midnight would otherwise keep yesterday's "today" —
  // recheck on tab-return (same trigger CookMode/PlanEditor use).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setTodayIso(todayISO());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  // Today uses a fixed 5-day look-ahead; the Plan page passes an explicit
  // (navigable) range that may reach into the past.
  const defaultTo = useMemo(() => addDays(todayIso, 5), [todayIso]);
  const from = range?.from ?? todayIso;
  const to = range?.to ?? defaultTo;

  const [days, setDays] = useState<AgendaDay[]>([]);
  const [nextCooks, setNextCooks] = useState<NextCook[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);

  // Tracks the range the most recently *issued* loadAgenda call was for, so a
  // response can tell whether a newer request has superseded it — otherwise
  // rapid Plan week navigation can let a stale response overwrite fresher
  // state (see PlanEditor's rangeRef for the same pattern).
  const rangeRef = useRef({ from, to });
  rangeRef.current = { from, to };

  const loadAgenda = useCallback(async () => {
    const reqFrom = from, reqTo = to;
    const res = await fetch(`/api/agenda?from=${reqFrom}&to=${reqTo}&today=${todayIso}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as AgendaResponse;
      if (reqFrom !== rangeRef.current.from || reqTo !== rangeRef.current.to) return;
      setDays(data.days);
      setNextCooks(data.nextCooks);
    }
  }, [from, to, todayIso]);

  const loadAnalysis = useCallback(async () => {
    const res = await fetch(`/api/nutrition/analysis?mode=day&date=${todayIso}`, { cache: "no-store" });
    if (res.ok) setAnalysis((await res.json()) as DayAnalysis);
    else setAnalysis(null);
  }, [todayIso]);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    (async () => {
      const [, sRes, rRes, pRes, iRes] = await Promise.all([
        loadAgenda(),
        fetch("/api/slots"),
        fetch("/api/recipes"),
        fetch("/api/products"),
        fetch("/api/ingredients"),
        loadAnalysis(),
      ]);
      if (!alive) return;
      if (sRes.ok) setSlots((await sRes.json()) as Slot[]);
      if (rRes.ok) setRecipes((await rRes.json()) as Recipe[]);
      if (pRes.ok) setProducts((await pRes.json()) as Product[]);
      if (iRes.ok) setIngredients((await iRes.json()) as Ingredient[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [mounted, loadAgenda, loadAnalysis]);

  const todayRef = useRef<HTMLDivElement | null>(null);

  // Namespaced so a batch and an event that happen to share a numeric id
  // can't disable/no-op each other's action.
  const [acting, setActing] = useState<string | null>(null);
  // Set when an optimistic eat/cook/serve mutation is rejected by the server.
  // The action's own `finally` reload resyncs the row to server truth (so the
  // optimistic flip reverts); this just tells the user it didn't take.
  const [actionError, setActionError] = useState<string | null>(null);
  // When serving a product/ingredient meal whose ingredient has >1 in-stock
  // product or has variants, ask which one was actually eaten before cooking.
  const [cookChoice, setCookChoice] = useState<
    { meal: AgendaMeal; date: string; choices: CookChoice[]; picked: Record<number, CookPick> } | null
  >(null);

  async function toggleMeal(meal: AgendaMeal, date: string) {
    // Synthetic batch rows (eventId null) share a batchId across every day
    // they're projected onto, so the optimistic update below must also scope
    // by date — otherwise toggling today's serving would flip every other
    // day's row for the same batch too.
    const key =
      meal.batchBacked && meal.batchId != null ? `batch:${meal.batchId}` : `event:${meal.eventId}`;
    if (acting === key) return;
    // Currently served? Then this tap UNDOES it (un-serve); otherwise it serves.
    const served = meal.phase === "served";
    // Serving a non-batch meal: if its ingredient(s) need a product/variant pick
    // (e.g. a trail mix with variants), ask first, then serve via confirmCook.
    if (!served && !meal.batchBacked && meal.eventId != null) {
      const res = await fetch(`/api/events/${meal.eventId}/cook`);
      const choices = res.ok ? ((await res.json()) as CookChoice[]) : [];
      if (choices.length > 0) {
        const picked: Record<number, CookPick> = Object.fromEntries(
          choices.map((c) => {
            const p = c.products[0];
            return [c.ingredientId, { productId: p.id, variantId: p.variants[0]?.id ?? null }];
          }),
        );
        setCookChoice({ meal, date, choices, picked });
        return;
      }
    }
    setActing(key);
    setActionError(null);
    // optimistic toggle
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) => {
          const matches = meal.eventId != null
            ? m.eventId === meal.eventId
            : d.date === date && m.eventId == null && m.batchId === meal.batchId && m.slotId === meal.slotId;
          if (!matches) return m;
          if (served) {
            // undo: batch servings go back to 'cooked' (still available). A
            // rotation meal returns to whatever serving came from — 'cooked' if
            // it was cooked ahead, else all the way back to 'planned'.
            if (meal.batchBacked) {
              return {
                ...m,
                eatenFromBatchToday: false,
                status: "planned" as const,
                phase: "cooked" as const,
                mealsRemaining: (m.mealsRemaining ?? 0) + 1,
              };
            }
            return meal.cookedAhead
              ? { ...m, status: "cooked" as const, phase: "cooked" as const }
              : { ...m, status: "planned" as const, phase: "planned" as const };
          }
          return meal.batchBacked
            ? {
                ...m,
                eatenFromBatchToday: true,
                status: "cooked" as const,
                phase: "served" as const,
                mealsRemaining: (m.mealsRemaining ?? 1) - 1,
              }
            : { ...m, status: "served" as const, phase: "served" as const };
        }),
      })),
    );
    const method = served ? "DELETE" : "POST";
    let ok = true;
    try {
      if (meal.batchBacked && meal.batchId != null) {
        const r = await fetch(`/api/batches/${meal.batchId}/eat`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
        ok = r.ok;
      } else if (meal.eventId != null) {
        const r = await fetch(`/api/events/${meal.eventId}/serve`, {
          method,
          ...(served ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) }),
        });
        ok = r.ok;
      }
    } catch {
      ok = false;
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
    if (!ok) setActionError(served ? "Couldn't undo that meal — please try again." : "Couldn't update that meal — please try again.");
  }

  // Serve an event with a chosen product/variant pick (from the cook sheet).
  async function serveWithPicks(meal: AgendaMeal, _date: string, picked: Record<number, CookPick>) {
    if (meal.eventId == null) return;
    const eventId = meal.eventId;
    setActing(`event:${eventId}`);
    setActionError(null);
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) =>
          m.eventId === eventId ? { ...m, status: "served" as const, phase: "served" as const } : m,
        ),
      })),
    );
    let ok = true;
    try {
      const r = await fetch(`/api/events/${eventId}/serve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: picked, force: true }),
      });
      ok = r.ok;
    } catch {
      ok = false;
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
    if (!ok) setActionError("Couldn't serve that meal — please try again.");
  }

  // Confirm the variant/product pick from the sheet, then serve.
  function confirmCook() {
    if (!cookChoice) return;
    const { meal, date, picked } = cookChoice;
    setCookChoice(null);
    void serveWithPicks(meal, date, picked);
  }

  // "Cook ahead" on a planned (non-batch) row: deplete stock now without
  // marking it eaten yet — the row becomes 'cooked' (amber), no nutrition
  // change until it's later served.
  async function cookAhead(meal: AgendaMeal) {
    if (meal.eventId == null || meal.batchBacked) return;
    const eventId = meal.eventId;
    const key = `event:${eventId}`;
    if (acting === key) return;
    setActing(key);
    setActionError(null);
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) =>
          m.eventId === eventId ? { ...m, status: "cooked" as const, phase: "cooked" as const } : m,
        ),
      })),
    );
    let ok = true;
    try {
      const r = await fetch(`/api/events/${eventId}/cook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      ok = r.ok;
    } catch {
      ok = false;
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
    if (!ok) setActionError("Couldn't cook that ahead — please try again.");
  }

  // Move one planned occurrence to another day/slot (drag-and-drop on the Plan
  // grid, or the inspector's fields). Fetches the row to preserve its item, then
  // PATCHes scope=one (the API won't shift a whole series' dates). No-op result
  // for cooked/served (the API refuses those).
  async function rescheduleEvent(eventId: number, date: string, slotId: number) {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return;
    const ev = (await res.json()) as {
      slotId: number; date: string; servings: number; amount: number | null;
      recipeId: number | null; productId: number | null; ingredientId: number | null; variantId: number | null;
    };
    if (ev.date === date && ev.slotId === slotId) return;
    const item = ev.recipeId != null
      ? { recipeId: ev.recipeId, servings: ev.servings }
      : ev.productId != null
        ? (ev.amount != null
            ? { productId: ev.productId, variantId: ev.variantId, amount: ev.amount }
            : { productId: ev.productId, variantId: ev.variantId, servings: ev.servings })
        : { ingredientId: ev.ingredientId, amount: ev.amount };
    await fetch(`/api/events/${eventId}?scope=one`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, slotId, ...item }),
    });
    await Promise.all([loadAgenda(), loadAnalysis()]);
  }

  // Undo a cook-ahead: back to 'planned', backing out the stock it depleted.
  async function uncookAhead(meal: AgendaMeal) {
    if (meal.eventId == null || meal.batchBacked) return;
    const eventId = meal.eventId;
    const key = `event:${eventId}`;
    if (acting === key) return;
    setActing(key);
    setActionError(null);
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) =>
          m.eventId === eventId ? { ...m, status: "planned" as const, phase: "planned" as const } : m,
        ),
      })),
    );
    let ok = true;
    try {
      const r = await fetch(`/api/events/${eventId}/cook`, { method: "DELETE" });
      ok = r.ok;
    } catch {
      ok = false;
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
    if (!ok) setActionError("Couldn't undo cooking — please try again.");
  }

  // Remove-meal flow: a rule-generated event asks which occurrences to drop,
  // mirroring MealCard/PlanEditor's scope chooser; a one-off deletes straight away.
  const [removeTarget, setRemoveTarget] = useState<{ eventId: number; name: string } | null>(null);

  function requestRemove(meal: AgendaMeal) {
    if (meal.eventId == null) return; // synthetic batch row — nothing to remove
    if (meal.ruleId != null) setRemoveTarget({ eventId: meal.eventId, name: meal.name });
    else void removeEvent(meal.eventId, "one");
  }

  async function removeEvent(eventId: number, scope: "one" | "following" | "all") {
    setRemoveTarget(null);
    await fetch(`/api/events/${eventId}?scope=${scope}`, { method: "DELETE" });
    await Promise.all([loadAgenda(), loadAnalysis()]);
  }

  // Delete a whole batch (restores the stock it depleted). Confirm first —
  // this drops every remaining serving across all its days.
  async function removeBatch(batchId: number) {
    if (!confirm("Delete this meal prep? Its remaining servings are removed and the stock it used is restored.")) return;
    await fetch(`/api/batches/${batchId}`, { method: "DELETE" });
    await Promise.all([loadAgenda(), loadAnalysis()]);
  }

  // Past days collapse to a summary by default; tap to expand into full rows.
  const [expandedPast, setExpandedPast] = useState<Set<string>>(new Set());
  function togglePast(date: string) {
    setExpandedPast((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  // Unified "Add" sheet state: shared Day/Slot, a 4-way type row
  // (recipe/product/ingredient/batch), then type-dependent fields.
  // Recipe/product/ingredient mirrors PlanEditor's add wizard (POST
  // /api/events for one-offs, POST /api/rules for recurring); batch reuses
  // the same Day/Slot as cookedDate/slotId and posts to POST /api/batches.
  const [addOpen, setAddOpen] = useState(false);
  const [addSlotId, setAddSlotId] = useState<number | null>(null);
  const [addDate, setAddDate] = useState(todayIso);
  const [addKind, setAddKind] = useState<AddKind>("recipe");
  const [addRecipeId, setAddRecipeId] = useState<number | null>(null);
  const [addServings, setAddServings] = useState(2);
  const [addProductId, setAddProductId] = useState<number | null>(null);
  const [addVariantId, setAddVariantId] = useState<number | null>(null);
  const [addVariants, setAddVariants] = useState<{ id: number; name: string }[]>([]);
  const [addProductAmount, setAddProductAmount] = useState("");
  const [addIngredientId, setAddIngredientId] = useState<number | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [addRepeat, setAddRepeat] = useState(false);
  const [addRepeatDays, setAddRepeatDays] = useState<boolean[]>(() => Array(7).fill(true));
  const [addIntervalN, setAddIntervalN] = useState(1);
  const [addUnit, setAddUnit] = useState<"day" | "week">("day");
  const [addUntil, setAddUntil] = useState("");
  // Recurrence as it was when an existing rule was opened for editing, so save
  // only touches the series when the user actually changed the cadence.
  const [editRuleSeed, setEditRuleSeed] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  // When set, the Add sheet is editing an existing meal/batch (PATCH, not POST).
  const [editEventId, setEditEventId] = useState<number | null>(null);
  const [editBatchId, setEditBatchId] = useState<number | null>(null);
  // Editing a rule-generated meal: which occurrences the save applies to.
  const [editRuleId, setEditRuleId] = useState<number | null>(null);
  const [editScope, setEditScope] = useState<"one" | "following" | "all">("one");
  const isEditing = editEventId != null || editBatchId != null;

  // Batch-only fields (addKind === "batch", edit path only now).
  const [addLabel, setAddLabel] = useState("");
  const [addMeals, setAddMeals] = useState(4);
  // The items of the meal being composed (creation), reused by the batch-edit form.
  const [addItems, setAddItems] = useState<MealItem[]>([
    { kind: "recipe", refId: null, servings: 2, amount: "" },
  ]);

  function addBatchItem() {
    setAddItems((prev) => [...prev, defaultMealItem("recipe", { recipes, products, ingredients })]);
  }

  function updateBatchItem(i: number, patch: Partial<MealItem>) {
    setAddItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function removeBatchItem(i: number) {
    setAddItems((prev) => prev.filter((_, j) => j !== i));
  }

  function openAdd(opts?: { date?: string; slotId?: number; type?: AddKind }) {
    setEditEventId(null);
    setEditBatchId(null);
    setEditRuleId(null);
    setEditScope("one");
    setAddDate(opts?.date ?? todayIso);
    setAddSlotId(opts?.slotId ?? slots[0]?.id ?? null);
    setAddKind(opts?.type ?? "recipe");
    setAddRecipeId(recipes[0]?.id ?? null);
    setAddServings(recipes[0]?.baseServings ?? 2);
    setAddProductId(null);
    setAddVariantId(null);
    setAddVariants([]);
    setAddProductAmount("");
    setAddIngredientId(ingredients[0]?.id ?? null);
    setAddAmount("");
    setAddRepeat(false);
    setAddRepeatDays(Array(7).fill(true));
    setAddIntervalN(1);
    setAddUnit("day");
    setAddUntil("");
    setEditRuleSeed(null);
    setAddLabel("");
    setAddMeals(4);
    setAddItems([defaultMealItem(opts?.type && opts.type !== "batch" ? opts.type : "recipe", { recipes, products, ingredients })]);
    setAddOpen(true);
  }

  // Command palette "Add meal" / "Log eaten" actions (mealpal-d3f): the
  // palette navigates here and fires one of these instead of building its own
  // add flow — this just calls the same opener a real "+" button would.
  useEffect(() => {
    return consumePendingCmdkAction((action) => {
      if (action.type === "add-meal") openAdd();
      else if (action.type === "log-eaten") openAdd({ date: todayIso });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso]);

  // Open the Add sheet pre-filled to edit a still-planned meal. Fetches the
  // full event row (the agenda row lacks servings/amount/variant).
  async function openEditMeal(meal: AgendaMeal) {
    if (meal.eventId == null) return;
    const res = await fetch(`/api/events/${meal.eventId}`);
    if (!res.ok) return;
    const ev = (await res.json()) as {
      date: string; slotId: number; servings: number; amount: number | null; status: string;
      recipeId: number | null; productId: number | null; variantId: number | null; ingredientId: number | null;
    };
    // A cooked event is locked server-side (its cook already depleted stock), so
    // reverse the cook first — uncookEvent restores the FEFO allocations exactly.
    if (ev.status === "cooked") {
      const un = await fetch(`/api/events/${meal.eventId}/cook`, { method: "DELETE" });
      if (!un.ok) { setActionError("Could not un-cook this meal to edit it."); return; }
      await Promise.all([loadAgenda(), loadAnalysis()]);
    }
    setEditBatchId(null);
    setEditEventId(meal.eventId);
    setEditRuleId(meal.ruleId);
    setEditScope("one");
    setAddDate(ev.date);
    setAddSlotId(ev.slotId);
    setAddRepeat(false);
    setEditRuleSeed(null);
    if (meal.ruleId != null) {
      const rres = await fetch("/api/rules");
      const rule = rres.ok
        ? ((await rres.json()) as { id: number; intervalN: number; unit: "day" | "week"; daysOfWeek: string; untilDate: string | null }[])
            .find((r) => r.id === meal.ruleId)
        : undefined;
      if (rule) {
        setAddIntervalN(rule.intervalN);
        setAddUnit(rule.unit);
        setAddRepeatDays(rule.daysOfWeek.split("").map((c) => c === "1"));
        setAddUntil(rule.untilDate ?? "");
        setEditRuleSeed(recurrenceKey(rule.intervalN, rule.unit, rule.daysOfWeek, rule.untilDate ?? ""));
      }
    }
    setAddProductAmount("");
    setAddAmount("");
    if (ev.recipeId != null) {
      setAddKind("recipe");
      setAddRecipeId(ev.recipeId);
      setAddServings(Math.max(1, Math.round(ev.servings)));
    } else if (ev.productId != null) {
      setAddKind("product");
      setAddProductId(ev.productId);
      setAddServings(Math.max(1, Math.round(ev.servings)));
      // Restore the exact canonical amount so re-saving without touching this
      // field preserves it — otherwise submitAdd falls back to the rounded
      // (min 1) servings above, silently inflating a fractional-serving event.
      setAddProductAmount(ev.amount != null ? String(ev.amount) : "");
      const vres = await fetch(`/api/products/${ev.productId}/variants`);
      setAddVariants(vres.ok ? ((await vres.json()) as { id: number; name: string }[]) : []);
      setAddVariantId(ev.variantId);
    } else if (ev.ingredientId != null) {
      setAddKind("ingredient");
      setAddIngredientId(ev.ingredientId);
      setAddAmount(ev.amount != null ? String(ev.amount) : "");
    }
    setAddOpen(true);
  }

  // Open the Add sheet pre-filled to edit a batch (full re-pack on save).
  async function openEditBatch(batchId: number) {
    const res = await fetch(`/api/batches/${batchId}`);
    if (!res.ok) return;
    const batch = (await res.json()) as {
      slotId: number; label: string; cookedDate: string; mealsTotal: number;
      items: { recipeId: number | null; productId: number | null; amount: number | null }[];
    };
    setEditEventId(null);
    setEditRuleId(null);
    setEditBatchId(batchId);
    setAddKind("batch");
    setAddDate(batch.cookedDate);
    setAddSlotId(batch.slotId);
    setAddLabel(batch.label);
    setAddMeals(batch.mealsTotal);
    setAddItems(
      batch.items.length
        ? batch.items.map((it) => ({
            kind: it.recipeId != null ? ("recipe" as const) : ("product" as const),
            refId: it.recipeId ?? it.productId ?? null,
            servings: 1,
            amount: it.amount != null ? String(it.amount) : "",
          }))
        : [defaultMealItem("recipe", { recipes, products, ingredients })],
    );
    setAddOpen(true);
  }

  async function selectAddProduct(id: number) {
    setAddProductId(id);
    setAddVariantId(null);
    setAddVariants([]);
    const res = await fetch(`/api/products/${id}/variants`);
    if (res.ok) {
      const vs = (await res.json()) as { id: number; name: string }[];
      setAddVariants(vs);
      // Default the planning variant to the first one so planned calories/macros
      // count without an extra step. The user can change it here; serving still
      // asks which variant was actually eaten (confirmCook).
      setAddVariantId(vs[0]?.id ?? null);
    }
  }

  const addRepeatInvalid = addRepeat && addUnit === "week" && !addRepeatDays.some(Boolean);
  const addMealValid =
    addSlotId != null &&
    !addRepeatInvalid &&
    (addKind === "recipe"
      ? addRecipeId != null
      : addKind === "product"
        ? addProductId != null && (addProductAmount === "" || Number(addProductAmount) > 0)
        : addKind === "ingredient"
          ? addIngredientId != null && Number(addAmount) > 0
          : false);
  const addBatchValid =
    addSlotId != null &&
    addLabel.trim().length > 0 &&
    addMeals >= 1 &&
    addItems.length > 0 &&
    addItems.every((it) => it.refId != null);
  // Creating a meal: every item must resolve to a valid one-of body.
  const addItemsValid =
    addSlotId != null &&
    !addRepeatInvalid &&
    addItems.length > 0 &&
    addItems.every((it) =>
      it.refId != null &&
      (it.kind === "ingredient"
        ? Number(it.amount) > 0
        : it.kind === "product"
          ? it.amount === "" || Number(it.amount) > 0
          : true));
  const addValid = editBatchId != null ? addBatchValid : editEventId != null ? addMealValid : addItemsValid;

  async function submitAdd() {
    if (!addValid || addSaving || addSlotId == null) return;
    setAddSaving(true);
    try {
      // Editing an existing batch: full re-pack (batches are no longer created,
      // only edited until they're retired).
      if (editBatchId != null) {
        const res = await fetch(`/api/batches/${editBatchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: addSlotId,
            label: addLabel.trim(),
            mealsTotal: addMeals,
            cookedDate: addDate,
            items: addItems.map((it) => {
              const amount = it.amount !== "" ? Number(it.amount) : undefined;
              return it.kind === "recipe"
                ? { recipeId: it.refId, amount }
                : { productId: it.refId, amount };
            }),
          }),
        });
        if (res.ok) {
          setAddOpen(false);
          await loadAgenda();
        }
        return;
      }

      // Editing a single planned meal: PATCH it in place (recurrence unchanged).
      if (editEventId != null) {
        let item: Record<string, unknown>;
        if (addKind === "recipe") {
          if (addRecipeId == null) return;
          item = { recipeId: addRecipeId, servings: addServings };
        } else if (addKind === "product") {
          if (addProductId == null) return;
          const amount = addProductAmount !== "" ? Number(addProductAmount) : undefined;
          item = amount != null
            ? { productId: addProductId, variantId: addVariantId, amount }
            : { productId: addProductId, variantId: addVariantId, servings: addServings };
        } else {
          const amount = Number(addAmount);
          if (addIngredientId == null || !Number.isFinite(amount) || amount <= 0) return;
          item = { ingredientId: addIngredientId, amount };
        }
        const res = await fetch(`/api/events/${editEventId}?scope=${editScope}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: addDate, slotId: addSlotId, ...item }),
        });
        // Recurrence lives on the rule, not the event — save it separately, and
        // only when it changed (the PATCH regenerates future occurrences).
        const dow = addRepeatDays.map((d) => (d ? "1" : "0")).join("");
        if (res.ok && editRuleId != null && editRuleSeed != null
            && recurrenceKey(addIntervalN, addUnit, dow, addUntil) !== editRuleSeed) {
          const rres = await fetch(`/api/rules/${editRuleId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intervalN: addIntervalN, unit: addUnit, daysOfWeek: dow, untilDate: addUntil || null }),
          });
          if (!rres.ok) setActionError("Meal saved, but the repeat schedule could not be updated.");
        }
        if (res.ok) {
          setAddOpen(false);
          await Promise.all([loadAgenda(), loadAnalysis()]);
        }
        return;
      }

      // Creating: a meal is a collection of items. Post each one — a one-off to
      // /api/events, or a per-item recurring rule to /api/rules when repeating.
      // ponytail: sequential posts; a mid-list failure leaves earlier items
      // added. Fine for a single-user household; make it a transactional bulk
      // endpoint if partial adds ever bite.
      const url = addRepeat ? "/api/rules" : "/api/events";
      let ok = true;
      for (const it of addItems) {
        const item = mealItemBody(it);
        const body = addRepeat
          ? {
              ...item, slotId: addSlotId, startDate: addDate,
              intervalN: addIntervalN, unit: addUnit,
              daysOfWeek: addRepeatDays.map((d) => (d ? "1" : "0")).join(""),
              untilDate: addUntil || null,
            }
          : { date: addDate, slotId: addSlotId, ...item };
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) { ok = false; break; }
      }
      if (ok) setAddOpen(false);
      await Promise.all([loadAgenda(), loadAnalysis()]);
    } finally {
      setAddSaving(false);
    }
  }

  return {
    userName,
    mounted,
    todayIso,
    todayRef,
    // data
    days,
    nextCooks,
    slots,
    recipes,
    products,
    ingredients,
    loading,
    analysis,
    // Re-fetch agenda + analysis (used by components that mutate via their own
    // fetches, e.g. the Plan inspector, and need the board to refresh after).
    reload: async () => { await Promise.all([loadAgenda(), loadAnalysis()]); },
    // row actions
    acting,
    actionError,
    setActionError,
    toggleMeal,
    cookAhead,
    uncookAhead,
    rescheduleEvent,
    requestRemove,
    removeBatch,
    // cook-choice sheet
    cookChoice,
    setCookChoice,
    confirmCook,
    // remove sheet
    removeTarget,
    setRemoveTarget,
    removeEvent,
    // past-day collapse
    expandedPast,
    togglePast,
    // add/edit sheet state
    addOpen,
    setAddOpen,
    addSlotId,
    setAddSlotId,
    addDate,
    setAddDate,
    addKind,
    setAddKind,
    addRecipeId,
    setAddRecipeId,
    addServings,
    setAddServings,
    addProductId,
    addVariantId,
    setAddVariantId,
    addVariants,
    addProductAmount,
    setAddProductAmount,
    addIngredientId,
    setAddIngredientId,
    addAmount,
    setAddAmount,
    addRepeat,
    setAddRepeat,
    addRepeatDays,
    setAddRepeatDays,
    addIntervalN,
    setAddIntervalN,
    addUnit,
    setAddUnit,
    addUntil,
    editRuleSeed,
    setAddUntil,
    addSaving,
    editBatchId,
    editRuleId,
    editScope,
    setEditScope,
    isEditing,
    addLabel,
    setAddLabel,
    addMeals,
    setAddMeals,
    addItems,
    addBatchItem,
    updateBatchItem,
    removeBatchItem,
    // add/edit openers + actions
    openAdd,
    openEditMeal,
    openEditBatch,
    selectAddProduct,
    addValid,
    submitAdd,
  };
}

export type AgendaState = ReturnType<typeof useAgenda>;
