"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { todayISO, toISODate, localNoon } from "@/lib/dates";

type Slot = { id: number; name: string; timeOfDay: string };
type Recipe = { id: number; name: string; baseServings: number };
type Product = { id: number; name: string; servingSize: number | null; canonicalUnit: string };
type Ingredient = { id: number; name: string; canonicalUnit: string };

type ItemKind = "recipe" | "product";
type PackItem = { kind: ItemKind; refId: number | null; amount: string };

type AddKind = "recipe" | "product" | "ingredient" | "batch";

type AgendaMeal = {
  eventId: number | null; // null for a synthetic batch-projected row (no meal_event backs it)
  slotId: number;
  slotName: string;
  name: string;
  recipeId: number | null;
  productId: number | null;
  ingredientId: number | null;
  status: "planned" | "cooked";
  phase: "planned" | "cooked" | "served";
  batchBacked: boolean;
  batchId: number | null;
  mealsRemaining: number | null;
  eatenFromBatchToday: boolean;
  ruleId: number | null;
  outOfStock: boolean;
  missingItems: string[];
};
type CookFlag = { slotId: number; slotName: string; label: string };
type AgendaDay = { date: string; meals: AgendaMeal[]; cookFlags: CookFlag[]; eatenCount: number; totalCount: number };
type NextCook = { slotId: number; slotName: string; label: string; cookDate: string; daysAway: number };
type AgendaResponse = { days: AgendaDay[]; nextCooks: NextCook[] };
// Which product/variant a meal's ingredient could be served as (from GET .../cook).
type CookChoice = {
  ingredientId: number;
  ingredientName: string;
  products: { id: number; name: string; onHand: number; variants: { id: number; name: string }[] }[];
};
type CookPick = { productId: number; variantId: number | null };

// Slot-name accent colors for the "Next cooking" cards.
function slotAccent(slotName: string): string {
  const n = slotName.toLowerCase();
  if (n.includes("lunch")) return "#c65a3a";
  if (n.includes("dinner")) return "#2f6b64";
  return "#7a6f57";
}

// Subset of GET /api/nutrition/analysis?mode=day&date=... used here — eaten
// ("nutrients") vs planned ("planned") totals, scaled to the household goal.
type DayAnalysis = {
  goals: { calorieGoal: number; proteinG: number; carbsG: number; fatG: number };
  nutrients: { calories: number; proteinG: number };
  planned: { calories: number; proteinG: number };
};

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Colors for the per-row phase chip: planned (taupe, not yet acted on),
// cooked (amber, batch serving ready but not eaten today), served (green,
// eaten/counts toward nutrition).
const PHASE_CHIP: Record<AgendaMeal["phase"], { bg: string; fg: string }> = {
  planned: { bg: "#a99e86", fg: "#fff" },
  cooked: { bg: "#e0a92e", fg: "#3a2f10" },
  served: { bg: "#5c8a5e", fg: "#fff" },
};

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

function addDays(date: string, n: number): string {
  return toISODate(new Date(localNoon(date).getTime() + n * 86_400_000));
}

export function TodayAgenda({ userName }: { userName?: string | null }) {
  // ponytail: server can't know the client's date/timezone, so all
  // time-derived text is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const todayIso = useMemo(todayISO, []);
  const from = useMemo(() => addDays(todayIso, -1), [todayIso]);
  const to = useMemo(() => addDays(todayIso, 5), [todayIso]);

  const [days, setDays] = useState<AgendaDay[]>([]);
  const [nextCooks, setNextCooks] = useState<NextCook[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);

  const loadAgenda = useCallback(async () => {
    const res = await fetch(`/api/agenda?from=${from}&to=${to}&today=${todayIso}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as AgendaResponse;
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

  const [acting, setActing] = useState<number | null>(null);
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
    const key = meal.batchBacked && meal.batchId != null ? meal.batchId : meal.eventId;
    if (acting === key) return;
    // Currently served? Then this tap UNDOES it (un-serve); otherwise it serves.
    const served = meal.status === "cooked" || (meal.batchBacked && meal.eatenFromBatchToday);
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
            // undo: back to cooked (batch still has the serving) or planned (rotation meal)
            return meal.batchBacked
              ? {
                  ...m,
                  eatenFromBatchToday: false,
                  status: "planned" as const,
                  phase: "cooked" as const,
                  mealsRemaining: (m.mealsRemaining ?? 0) + 1,
                }
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
            : { ...m, status: "cooked" as const, phase: "served" as const };
        }),
      })),
    );
    const method = served ? "DELETE" : "POST";
    try {
      if (meal.batchBacked && meal.batchId != null) {
        await fetch(`/api/batches/${meal.batchId}/eat`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
      } else if (meal.eventId != null) {
        await fetch(`/api/events/${meal.eventId}/cook`, {
          method,
          ...(served ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) }),
        });
      }
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
  }

  // Confirm the variant/product pick, then serve (cook the event with allocations).
  async function confirmCook() {
    if (!cookChoice) return;
    const { meal, picked } = cookChoice;
    setCookChoice(null);
    if (meal.eventId == null) return;
    setActing(meal.eventId);
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) =>
          m.eventId === meal.eventId ? { ...m, status: "cooked" as const, phase: "served" as const } : m,
        ),
      })),
    );
    try {
      await fetch(`/api/events/${meal.eventId}/cook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: picked, force: true }),
      });
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
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
  const [addSaving, setAddSaving] = useState(false);

  // Batch-only fields (addKind === "batch").
  const [addLabel, setAddLabel] = useState("");
  const [addMeals, setAddMeals] = useState(4);
  const [addItems, setAddItems] = useState<PackItem[]>([{ kind: "recipe", refId: null, amount: "" }]);

  function addBatchItem() {
    setAddItems((prev) => [...prev, { kind: "recipe", refId: recipes[0]?.id ?? null, amount: "" }]);
  }

  function updateBatchItem(i: number, patch: Partial<PackItem>) {
    setAddItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function removeBatchItem(i: number) {
    setAddItems((prev) => prev.filter((_, j) => j !== i));
  }

  function openAdd(opts?: { date?: string; slotId?: number; type?: AddKind }) {
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
    setAddLabel("");
    setAddMeals(4);
    setAddItems([{ kind: "recipe", refId: recipes[0]?.id ?? null, amount: "" }]);
    setAddOpen(true);
  }

  async function selectAddProduct(id: number) {
    setAddProductId(id);
    setAddVariantId(null);
    setAddVariants([]);
    const res = await fetch(`/api/products/${id}/variants`);
    if (res.ok) setAddVariants((await res.json()) as { id: number; name: string }[]);
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
  const addValid = addKind === "batch" ? addBatchValid : addMealValid;

  async function submitAdd() {
    if (!addValid || addSaving || addSlotId == null) return;
    setAddSaving(true);
    try {
      if (addKind === "batch") {
        const res = await fetch("/api/batches", {
          method: "POST",
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

      const url = addRepeat ? "/api/rules" : "/api/events";
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
      if (res.ok) {
        setAddOpen(false);
        await Promise.all([loadAgenda(), loadAnalysis()]);
      }
    } finally {
      setAddSaving(false);
    }
  }

  const dateLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // One meal row: checkbox (eat/cook), name + slot, batch chip, remove.
  function mealRow(meal: AgendaMeal, date: string) {
    const checked = meal.status === "cooked" || (meal.batchBacked && meal.eatenFromBatchToday);
    const key = meal.batchBacked && meal.batchId != null ? meal.batchId : meal.eventId;
    const empty = meal.mealsRemaining != null && meal.mealsRemaining <= 0;
    const low = meal.mealsRemaining != null && meal.mealsRemaining <= 1;
    const rowKey = meal.eventId != null ? `ev-${meal.eventId}` : `batch-${meal.batchId}-${meal.slotId}-${date}`;
    return (
      <div
        key={rowKey}
        className="row"
        style={meal.outOfStock ? { background: "#fbeeeb", borderColor: "#e6b3a8" } : undefined}
      >
        <button
          type="button"
          className="checkbox"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `${meal.name} eaten, tap to undo` : `Mark ${meal.name} eaten`}
          disabled={acting === key}
          onClick={() => toggleMeal(meal, date)}
        />
        <div className="row-main">
          {(() => {
            // Link the name to its recipe/product/ingredient page. Batch rows
            // (synthetic — all ids null) stay plain text: no redirect.
            const href =
              meal.recipeId != null
                ? `/recipes/${meal.recipeId}`
                : meal.productId != null
                  ? `/manage/products/${meal.productId}`
                  : meal.ingredientId != null
                    ? `/manage/ingredients/${meal.ingredientId}`
                    : null;
            return href ? (
              <Link href={href} className="title">
                {meal.name}
              </Link>
            ) : (
              <div>{meal.name}</div>
            );
          })()}
          <span className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>
            {meal.slotName}
          </span>
          {meal.outOfStock && (
            <div style={{ color: "#c0392b", fontSize: "0.66em", fontWeight: 700 }}>
              ⚠ out of stock: {meal.missingItems.join(", ")}
            </div>
          )}
        </div>
        {meal.batchBacked && (
          <span className={low ? "chip run" : "chip"}>
            {empty ? "empty · cook" : low ? "cook soon" : `${meal.mealsRemaining} left`}
          </span>
        )}
        <span
          aria-label={`Status: ${meal.phase}`}
          style={{
            background: meal.outOfStock ? "#c0392b" : PHASE_CHIP[meal.phase].bg,
            color: meal.outOfStock ? "#fff" : PHASE_CHIP[meal.phase].fg,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            borderRadius: 99,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {meal.phase}
        </span>
        {meal.eventId != null && (
          <button
            type="button"
            className="btn-add"
            aria-label={`Remove ${meal.name}`}
            style={{ padding: "4px 10px", minHeight: "auto" }}
            onClick={() => requestRemove(meal)}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  if (!mounted) {
    return (
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <p className="eb">&nbsp;</p>
            <h1>&nbsp;</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <p className="eb">Today</p>
            <h1>{dateLabel}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>

      <div className="content stack">
        {mounted && nextCooks.length > 0 && (
          <div>
            <p className="section-label">🍳 Next cooking</p>
            <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
              {nextCooks.map((nc) => {
                const accent = slotAccent(nc.slotName);
                const dateLabel = localNoon(nc.cookDate)
                  .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                  .replace(/^(\w{3})\./, "$1"); // strip a trailing period on the weekday, if any
                const inLabel = nc.daysAway === 0 ? "today" : nc.daysAway === 1 ? "tomorrow" : `in ${nc.daysAway} days`;
                return (
                  <div
                    key={nc.slotId}
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      background: "#fbf8f0",
                      border: "1px solid #e2dac7",
                      borderTop: `4px solid ${accent}`,
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: accent }}>
                      {nc.slotName.toLowerCase()} prep
                    </div>
                    <div style={{ fontSize: 13, color: "var(--sage)", margin: "2px 0 6px" }}>{nc.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{dateLabel}</div>
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 6,
                        background: accent,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 99,
                        padding: "3px 8px",
                      }}
                    >
                      {inLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {analysis && (
          <div>
            <p className="section-label">Today vs goal</p>
            <MacroBar
              label="Calories"
              cooked={analysis.nutrients.calories}
              planned={analysis.planned.calories}
              goal={analysis.goals.calorieGoal}
              unit=""
              color="var(--paprika)"
            />
            <MacroBar
              label="Protein"
              cooked={analysis.nutrients.proteinG}
              planned={analysis.planned.proteinG}
              goal={analysis.goals.proteinG}
              unit="g"
              color="var(--turmeric)"
            />
          </div>
        )}

        {loading ? (
          <p className="loading">Loading…</p>
        ) : days.length === 0 ? (
          <p className="empty">Nothing on the agenda — tap + to add.</p>
        ) : (
          <div className="stack-sm">
            {days.map((day) => {
              const isToday = day.date === todayIso;
              const isPast = day.date < todayIso;
              const expanded = !isPast || expandedPast.has(day.date);
              return (
                <div key={day.date} ref={isToday ? todayRef : undefined}>
                  <p
                    className="section-label"
                    style={isToday ? { color: "var(--paprika)", borderTopColor: "var(--paprika)" } : undefined}
                  >
                    {dayHeaderLabel(day.date, todayIso)}
                  </p>

                  {isPast && (
                    <button
                      type="button"
                      className="empty"
                      style={{ padding: "0 0 8px", textAlign: "left", background: "none", border: "none", cursor: "pointer", width: "100%", color: "inherit" }}
                      onClick={() => togglePast(day.date)}
                      aria-expanded={expanded}
                    >
                      {day.eatenCount}/{day.totalCount} eaten{day.eatenCount === day.totalCount && day.totalCount > 0 ? " ✓" : ""}
                      {" "}
                      {expanded ? "▾" : "▸"}
                    </button>
                  )}

                  {expanded && (
                    // Not ".stack-sm": the desktop layout turns any stack whose
                    // direct children are ".row" into a multi-column grid (see
                    // globals.css), which made a day's cook-flag row and meal
                    // rows render side-by-side instead of stacked. This day
                    // section must always stay a single full-width column.
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {day.cookFlags.map((flag, i) => (
                        <button
                          key={`${day.date}-${flag.slotId}-${i}`}
                          type="button"
                          className="row"
                          style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer" }}
                          onClick={() => openAdd({ date: day.date, slotId: flag.slotId, type: "batch" })}
                        >
                          <span className="row-main">🍳 cook {flag.label}</span>
                          <span className="chip run">{flag.slotName}</span>
                        </button>
                      ))}

                      {day.meals.length === 0 ? (
                        <p className="empty" style={{ padding: "0 0 8px", textAlign: "left" }}>
                          Nothing planned.
                        </p>
                      ) : (
                        day.meals.map((meal) => mealRow(meal, day.date))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Floating "+" FAB opens the merged Add sheet directly. Disabled
          while loading: opening the sheet early locks the default item's
          refId to null (recipes/products not fetched yet), leaving the
          form stuck invalid. Sits above the bottom nav (z-index 30) but
          below the Sheet's scrim/panel (z-index 40/41) so an open sheet
          still covers it. */}
      <button
        type="button"
        aria-label="Add"
        disabled={loading}
        onClick={() => openAdd()}
        style={{
          position: "fixed",
          right: 20,
          bottom: 84,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--paprika)",
          color: "#fff",
          border: "none",
          fontSize: 28,
          lineHeight: 1,
          boxShadow: "0 6px 16px rgba(0,0,0,.25)",
          zIndex: 35,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: loading ? "default" : "pointer",
        }}
      >
        +
      </button>

      <Sheet open={addOpen} title="Add" onClose={() => setAddOpen(false)}>
        <div className="sh-body stack-sm">
          <div className="field">
            <span className="field-label">Day</span>
            <input
              type="date"
              className="input"
              value={addDate}
              onChange={(e) => e.target.value && setAddDate(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="field-label">Slot</span>
            <Dropdown
              label="Slot"
              value={addSlotId}
              options={slots.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => setAddSlotId(Number(id))}
            />
          </div>

          <div className="filter">
            <button type="button" aria-pressed={addKind === "recipe"} onClick={() => setAddKind("recipe")}>
              Recipe
            </button>
            <button type="button" aria-pressed={addKind === "product"} onClick={() => setAddKind("product")}>
              Product
            </button>
            <button type="button" aria-pressed={addKind === "ingredient"} onClick={() => setAddKind("ingredient")}>
              Ingredient
            </button>
            <button type="button" aria-pressed={addKind === "batch"} onClick={() => setAddKind("batch")}>
              Batch
            </button>
          </div>

          {addKind === "recipe" && (
            <>
              <div className="field">
                <span className="field-label">Recipe</span>
                <Dropdown
                  label="Recipe"
                  value={addRecipeId}
                  options={recipes.map((r) => ({ id: r.id, label: r.name }))}
                  onChange={(id) => setAddRecipeId(Number(id))}
                />
              </div>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
                <Stepper value={addServings} min={1} onChange={setAddServings} />
              </div>
            </>
          )}

          {addKind === "product" && (
            <>
              <div className="field">
                <span className="field-label">Product</span>
                <Dropdown
                  label="Product"
                  value={addProductId}
                  options={products.map((p) => ({ id: p.id, label: p.name }))}
                  onChange={(id) => selectAddProduct(Number(id))}
                />
              </div>
              {addVariants.length > 0 && (
                <div className="field">
                  <span className="field-label">Variant (optional)</span>
                  <Dropdown
                    label="Variant"
                    value={addVariantId}
                    options={addVariants.map((v) => ({ id: v.id, label: v.name }))}
                    onChange={(id) => setAddVariantId(Number(id))}
                  />
                </div>
              )}
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
                <Stepper value={addServings} min={1} onChange={setAddServings} />
              </div>
              <div className="field">
                <span className="field-label">Amount (optional)</span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={addProductAmount}
                  onChange={(e) => setAddProductAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 150"
                />
              </div>
            </>
          )}

          {addKind === "ingredient" && (
            <>
              <div className="field">
                <span className="field-label">Ingredient</span>
                <Dropdown
                  label="Ingredient"
                  value={addIngredientId}
                  options={ingredients.map((i) => ({ id: i.id, label: i.name }))}
                  onChange={(id) => setAddIngredientId(Number(id))}
                />
              </div>
              <div className="field">
                <span className="field-label">
                  Amount{addIngredientId != null ? ` (${ingredients.find((i) => i.id === addIngredientId)?.canonicalUnit ?? ""})` : ""}
                </span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 43"
                />
              </div>
            </>
          )}

          {addKind === "batch" && (
            <>
              <div className="field">
                <span className="field-label">Label</span>
                <input
                  className="input"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  placeholder="e.g. Chicken & rice"
                />
              </div>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Meals</span>
                <Stepper value={addMeals} min={1} onChange={setAddMeals} />
              </div>

              <p className="section-label">Contents</p>
              {addItems.map((it, i) => (
                <div key={i} className="stack-sm" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
                  <div className="filter">
                    <button
                      type="button"
                      aria-pressed={it.kind === "recipe"}
                      onClick={() => updateBatchItem(i, { kind: "recipe", refId: recipes[0]?.id ?? null })}
                    >
                      Recipe
                    </button>
                    <button
                      type="button"
                      aria-pressed={it.kind === "product"}
                      // ponytail: no variant picker for direct-product batch items — base product only
                      onClick={() => updateBatchItem(i, { kind: "product", refId: products[0]?.id ?? null })}
                    >
                      Product
                    </button>
                  </div>
                  <div className="field">
                    <span className="field-label">{it.kind === "recipe" ? "Recipe" : "Product"}</span>
                    <Dropdown
                      label={it.kind === "recipe" ? "Recipe" : "Product"}
                      value={it.refId}
                      options={
                        it.kind === "recipe"
                          ? recipes.map((r) => ({ id: r.id, label: r.name }))
                          : products.map((p) => ({ id: p.id, label: p.name }))
                      }
                      onChange={(id) => updateBatchItem(i, { refId: Number(id) })}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Amount (optional)</span>
                    <input
                      className="input mono"
                      inputMode="decimal"
                      value={it.amount}
                      onChange={(e) => updateBatchItem(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                      placeholder="e.g. 4"
                    />
                  </div>
                  {addItems.length > 1 && (
                    <button type="button" className="btn-add" onClick={() => removeBatchItem(i)}>
                      Remove item
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-add" onClick={addBatchItem}>
                + Add item
              </button>
            </>
          )}

          {addKind !== "batch" && (
            <>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Repeat</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={addRepeat}
                  className={addRepeat ? "btn" : "btn-add"}
                  onClick={() => setAddRepeat((v) => !v)}
                >
                  {addRepeat ? "On" : "Off"}
                </button>
              </div>
              {addRepeat && (
                <>
                  {addUnit === "week" && (
                    <div className="week week--repeat" role="group" aria-label="Repeat on">
                      {DOW.map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-pressed={addRepeatDays[i]}
                          className={addRepeatDays[i] ? "day on" : "day"}
                          onClick={() => setAddRepeatDays((ds) => ds.map((d, j) => (j === i ? !d : d)))}
                        >
                          <span className="dow">{label[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="servings-row">
                    <span className="field-label" style={{ marginBottom: 0 }}>Every</span>
                    <Stepper value={addIntervalN} min={1} onChange={setAddIntervalN} />
                    <Dropdown
                      label="Unit"
                      value={addUnit}
                      options={[
                        { id: "week", label: addIntervalN > 1 ? "weeks" : "week" },
                        { id: "day", label: addIntervalN > 1 ? "days" : "day" },
                      ]}
                      onChange={(id) => setAddUnit(id === "day" ? "day" : "week")}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Until (optional)</span>
                    <input
                      type="date"
                      className="input"
                      data-empty={addUntil ? undefined : ""}
                      value={addUntil}
                      min={addDate}
                      onChange={(e) => setAddUntil(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <button type="button" className="btn block" disabled={!addValid || addSaving} onClick={submitAdd}>
            {addSaving ? "Adding…" : "Add"}
          </button>
        </div>
      </Sheet>

      <Sheet open={cookChoice !== null} title="Which did you have?" onClose={() => setCookChoice(null)}>
        <div className="sh-body stack-sm">
          {cookChoice?.choices.map((c) => {
            const sel = cookChoice.picked[c.ingredientId];
            const selProduct = c.products.find((p) => p.id === sel?.productId) ?? c.products[0];
            return (
              <div key={c.ingredientId} style={{ marginBottom: 12 }}>
                <p className="body" style={{ color: "var(--sage)" }}>{c.ingredientName}</p>
                {c.products.length > 1 && (
                  <div className="field">
                    <span className="field-label">Product</span>
                    <Dropdown
                      label="Product"
                      value={sel?.productId ?? null}
                      options={c.products.map((p) => ({ id: p.id, label: p.name }))}
                      onChange={(id) => {
                        const p = c.products.find((x) => x.id === Number(id))!;
                        setCookChoice((cc) =>
                          cc && { ...cc, picked: { ...cc.picked, [c.ingredientId]: { productId: p.id, variantId: p.variants[0]?.id ?? null } } },
                        );
                      }}
                    />
                  </div>
                )}
                {selProduct.variants.length > 0 && (
                  <div className="field">
                    <span className="field-label">Variant</span>
                    <Dropdown
                      label="Variant"
                      value={sel?.variantId ?? null}
                      options={selProduct.variants.map((v) => ({ id: v.id, label: v.name }))}
                      onChange={(id) =>
                        setCookChoice((cc) =>
                          cc && { ...cc, picked: { ...cc.picked, [c.ingredientId]: { productId: selProduct.id, variantId: Number(id) } } },
                        )
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="btn block" onClick={confirmCook}>Serve it</button>
        </div>
      </Sheet>

      <Sheet open={removeTarget !== null} title="Remove repeating meal" onClose={() => setRemoveTarget(null)}>
        <div className="sh-body">
          <p className="body" style={{ color: "var(--sage)" }}>
            “{removeTarget?.name}” repeats. What do you want to remove?
          </p>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "one")}>
            This meal only
          </button>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "following")}>
            This and all future meals
          </button>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "all")}>
            All meals in the series
          </button>
        </div>
      </Sheet>
    </>
  );
}

function dayHeaderLabel(date: string, todayIso: string): string {
  if (date === todayIso) return "Today";
  const diffDays = Math.round((localNoon(date).getTime() - localNoon(todayIso).getTime()) / 86_400_000);
  if (diffDays === -1) return "Yesterday";
  return localNoon(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Two bars per nutrient — eaten (solid) then the not-yet-eaten remainder of
// the plan (faded) — both scaled to the goal, mirroring the nutrition page.
function MacroBar({ label, cooked, planned, goal, unit, color }: {
  label: string; cooked: number; planned: number; goal: number; unit: string; color: string;
}) {
  const pct = (v: number) => (goal > 0 ? Math.min(100, (v / goal) * 100) : 0);
  const cookedW = pct(cooked);
  const remW = Math.max(0, pct(planned) - cookedW);
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <b>{label}</b>
        <span className="mono" style={{ fontSize: 11, color: "var(--sage)" }}>
          {Math.round(planned)} / {goal}{unit}
        </span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 99, background: "#e3ddcc", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${cookedW}%`, background: color }} />
        <div style={{ height: "100%", width: `${remW}%`, background: color, opacity: 0.45 }} />
      </div>
    </div>
  );
}
