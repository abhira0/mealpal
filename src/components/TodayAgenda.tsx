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

type AddKind = "recipe" | "product" | "ingredient";

type AgendaMeal = {
  eventId: number;
  slotId: number;
  slotName: string;
  name: string;
  status: "planned" | "cooked";
  batchBacked: boolean;
  batchId: number | null;
  mealsRemaining: number | null;
  eatenFromBatchToday: boolean;
  ruleId: number | null;
};
type CookFlag = { slotId: number; slotName: string; label: string };
type AgendaDay = { date: string; meals: AgendaMeal[]; cookFlags: CookFlag[]; eatenCount: number; totalCount: number };

// Subset of GET /api/nutrition/analysis?mode=day&date=... used here — eaten
// ("nutrients") vs planned ("planned") totals, scaled to the household goal.
type DayAnalysis = {
  goals: { calorieGoal: number; proteinG: number; carbsG: number; fatG: number };
  nutrients: { calories: number; proteinG: number };
  planned: { calories: number; proteinG: number };
};

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);

  const loadAgenda = useCallback(async () => {
    const res = await fetch(`/api/agenda?from=${from}&to=${to}&today=${todayIso}`, { cache: "no-store" });
    if (res.ok) setDays((await res.json()) as AgendaDay[]);
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

  // Scroll today's block into view once the agenda has rendered.
  const todayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading && days.length > 0) todayRef.current?.scrollIntoView({ block: "start" });
  }, [loading, days.length]);

  const [acting, setActing] = useState<number | null>(null);

  // Floating "+" FAB menu (Add meal / Pack a batch), replacing the old
  // per-day and bottom-of-page add buttons.
  const [fabOpen, setFabOpen] = useState(false);

  async function eatMeal(meal: AgendaMeal, date: string) {
    const key = meal.batchBacked && meal.batchId != null ? meal.batchId : meal.eventId;
    if (acting === key) return;
    setActing(key);
    // optimistic check
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        meals: d.meals.map((m) =>
          m.eventId === meal.eventId
            ? meal.batchBacked
              ? { ...m, eatenFromBatchToday: true, mealsRemaining: (m.mealsRemaining ?? 1) - 1 }
              : { ...m, status: "cooked" as const }
            : m,
        ),
      })),
    );
    try {
      if (meal.batchBacked && meal.batchId != null) {
        await fetch(`/api/batches/${meal.batchId}/eat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
      } else {
        await fetch(`/api/events/${meal.eventId}/cook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
      }
    } finally {
      await Promise.all([loadAgenda(), loadAnalysis()]);
      setActing(null);
    }
  }

  // Remove-meal flow: a rule-generated event asks which occurrences to drop,
  // mirroring MealCard/PlanEditor's scope chooser; a one-off deletes straight away.
  const [removeTarget, setRemoveTarget] = useState<{ eventId: number; name: string } | null>(null);

  function requestRemove(meal: AgendaMeal) {
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

  // Pack-a-batch sheet state.
  const [packOpen, setPackOpen] = useState(false);
  const [packSlotId, setPackSlotId] = useState<number | null>(null);
  const [packLabel, setPackLabel] = useState("");
  const [packMeals, setPackMeals] = useState(4);
  const [packItems, setPackItems] = useState<PackItem[]>([{ kind: "recipe", refId: null, amount: "" }]);
  const [packing, setPacking] = useState(false);

  function openPack(preselectSlotId?: number) {
    setPackSlotId(preselectSlotId ?? slots[0]?.id ?? null);
    setPackLabel("");
    setPackMeals(4);
    setPackItems([{ kind: "recipe", refId: recipes[0]?.id ?? null, amount: "" }]);
    setPackOpen(true);
  }

  function addItem() {
    setPackItems((prev) => [...prev, { kind: "recipe", refId: recipes[0]?.id ?? null, amount: "" }]);
  }

  function updateItem(i: number, patch: Partial<PackItem>) {
    setPackItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setPackItems((prev) => prev.filter((_, j) => j !== i));
  }

  const packValid =
    packSlotId != null &&
    packLabel.trim().length > 0 &&
    packMeals >= 1 &&
    packItems.length > 0 &&
    packItems.every((it) => it.refId != null);

  async function pack() {
    if (!packValid || packing) return;
    setPacking(true);
    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: packSlotId,
        label: packLabel.trim(),
        mealsTotal: packMeals,
        cookedDate: todayIso,
        items: packItems.map((it) => {
          const amount = it.amount !== "" ? Number(it.amount) : undefined;
          return it.kind === "recipe"
            ? { recipeId: it.refId, amount }
            : { productId: it.refId, amount };
        }),
      }),
    });
    setPacking(false);
    if (res.ok) {
      setPackOpen(false);
      await loadAgenda();
    }
  }

  // Add-meal sheet state: slot → day → kind → details → optional repeat rule.
  // Mirrors PlanEditor's add wizard (POST /api/events for one-offs, POST
  // /api/rules for recurring), collapsed into a single sheet.
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

  function openAddMeal(date?: string, slotId?: number) {
    setAddDate(date ?? todayIso);
    setAddSlotId(slotId ?? slots[0]?.id ?? null);
    setAddKind("recipe");
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
        : addIngredientId != null && Number(addAmount) > 0);

  async function saveAddMeal() {
    if (!addMealValid || addSaving || addSlotId == null) return;

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

    setAddSaving(true);
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setAddSaving(false);
    if (res.ok) {
      setAddOpen(false);
      await Promise.all([loadAgenda(), loadAnalysis()]);
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
    return (
      <div key={meal.eventId} className="row">
        <button
          type="button"
          className="checkbox"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `${meal.name} eaten` : `Mark ${meal.name} eaten`}
          disabled={checked || acting === key}
          onClick={() => eatMeal(meal, date)}
        />
        <div className="row-main">
          <div>{meal.name}</div>
          <span className="section-label" style={{ margin: 0, padding: 0, border: "none" }}>
            {meal.slotName}
          </span>
        </div>
        {meal.batchBacked && (
          <span className={low ? "chip run" : "chip"}>
            {empty ? "empty · cook" : low ? "cook soon" : `${meal.mealsRemaining} left`}
          </span>
        )}
        <button
          type="button"
          className="btn-add"
          aria-label={`Remove ${meal.name}`}
          style={{ padding: "4px 10px", minHeight: "auto" }}
          onClick={() => requestRemove(meal)}
        >
          ×
        </button>
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
                    <div className="stack-sm">
                      {day.cookFlags.map((flag, i) => (
                        <button
                          key={`${day.date}-${flag.slotId}-${i}`}
                          type="button"
                          className="row"
                          style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer" }}
                          onClick={() => openPack(flag.slotId)}
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

      {/* Floating "+" FAB replaces the old per-day / bottom add buttons.
          Disabled while loading: opening a sheet early locks the default
          item's refId to null (recipes/products not fetched yet), leaving
          the forms stuck invalid. Sits above the bottom nav (z-index 30)
          but below the Sheet's scrim/panel (z-index 40/41) so an open sheet
          still covers it. */}
      <button
        type="button"
        aria-label="Add"
        aria-expanded={fabOpen}
        disabled={loading}
        onClick={() => setFabOpen((v) => !v)}
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
        {fabOpen ? "×" : "+"}
      </button>

      {fabOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setFabOpen(false)}
            style={{ position: "fixed", inset: 0, background: "transparent", border: "none", zIndex: 34, cursor: "default" }}
          />
          <div
            style={{
              position: "fixed",
              right: 20,
              bottom: 148,
              zIndex: 35,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                openAddMeal();
              }}
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--line)",
                borderRadius: 99,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(0,0,0,.18)",
                cursor: "pointer",
              }}
            >
              Add meal
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                openPack();
              }}
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--line)",
                borderRadius: 99,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(0,0,0,.18)",
                cursor: "pointer",
              }}
            >
              Pack a batch
            </button>
          </div>
        </>
      )}

      <Sheet open={packOpen} title="Pack a batch" onClose={() => setPackOpen(false)}>
        <div className="sh-body stack-sm">
          <div className="field">
            <span className="field-label">Slot</span>
            <Dropdown
              label="Slot"
              value={packSlotId}
              options={slots.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => setPackSlotId(Number(id))}
            />
          </div>
          <div className="field">
            <span className="field-label">Label</span>
            <input
              className="input"
              value={packLabel}
              onChange={(e) => setPackLabel(e.target.value)}
              placeholder="e.g. Chicken & rice"
            />
          </div>
          <div className="servings-row">
            <span className="field-label" style={{ marginBottom: 0 }}>Meals</span>
            <Stepper value={packMeals} min={1} onChange={setPackMeals} />
          </div>

          <p className="section-label">Contents</p>
          {packItems.map((it, i) => (
            <div key={i} className="stack-sm" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
              <div className="filter">
                <button
                  type="button"
                  aria-pressed={it.kind === "recipe"}
                  onClick={() => updateItem(i, { kind: "recipe", refId: recipes[0]?.id ?? null })}
                >
                  Recipe
                </button>
                <button
                  type="button"
                  aria-pressed={it.kind === "product"}
                  // ponytail: no variant picker for direct-product batch items — base product only
                  onClick={() => updateItem(i, { kind: "product", refId: products[0]?.id ?? null })}
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
                  onChange={(id) => updateItem(i, { refId: Number(id) })}
                />
              </div>
              <div className="field">
                <span className="field-label">Amount (optional)</span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={it.amount}
                  onChange={(e) => updateItem(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                  placeholder="e.g. 4"
                />
              </div>
              {packItems.length > 1 && (
                <button type="button" className="btn-add" onClick={() => removeItem(i)}>
                  Remove item
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-add" onClick={addItem}>
            + Add item
          </button>

          <button type="button" className="btn block" disabled={!packValid || packing} onClick={pack}>
            {packing ? "Packing…" : "Pack"}
          </button>
        </div>
      </Sheet>

      <Sheet open={addOpen} title="Add a meal" onClose={() => setAddOpen(false)}>
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

          <button type="button" className="btn block" disabled={!addMealValid || addSaving} onClick={saveAddMeal}>
            {addSaving ? "Adding…" : addRepeat ? "Add repeating meal" : "Add meal"}
          </button>
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
          {Math.round(cooked)} / {goal}{unit}
        </span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 99, background: "#e3ddcc", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${cookedW}%`, background: color }} />
        <div style={{ height: "100%", width: `${remW}%`, background: color, opacity: 0.45 }} />
      </div>
    </div>
  );
}
