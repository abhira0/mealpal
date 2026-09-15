"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { MealCard } from "@/components/MealCard";
import { Skeleton } from "@/components/Skeleton";

type Slot = { id: number; name: string; timeOfDay: string };
type Recipe = { id: number; name: string; baseServings: number };
type Product = { id: number; name: string; servingSize: number | null; canonicalUnit: string };
type Ingredient = { id: number; name: string; canonicalUnit: string };
type MealEvent = {
  id: number;
  date: string;
  slotId: number;
  recipeId: number | null;
  servings: number;
  ingredientId: number | null;
  productId: number | null;
  variantId: number | null;
  amount: number | null;
  status: string;
  ruleId: number | null;
  variantName: string | null;
};
type AddKind = "recipe" | "product" | "ingredient";

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 7-day strip: 1 day back through 5 days ahead, relative to a given date. */
function windowAround(iso: string): Date[] {
  const base = new Date(iso + "T00:00:00");
  const days: Date[] = [];
  for (let i = -1; i <= 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push(d);
  }
  return days;
}

function todayISO(): string {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return isoOf(t);
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export function PlanEditor({ userName }: { userName?: string | null }) {
  const [todayIso, setTodayIso] = useState<string>(todayISO);
  const [selected, setSelected] = useState<string>(todayIso);
  // ponytail: server can't know the client's date/timezone, so all time-derived
  // text (today, greeting, locale dates, the strip) is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A tab left open past midnight would otherwise keep yesterday's "today" —
  // the Today button, isToday highlight, and header date all go stale. Cheap
  // to recheck on tab-return (same trigger CookMode uses for its wake lock).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setTodayIso(todayISO());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The strip slides to keep `selected` in view; the events range follows it.
  const days = useMemo(() => windowAround(selected), [selected]);
  const from = isoOf(days[0]);
  const to = isoOf(days[days.length - 1]);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [events, setEvents] = useState<MealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form state: one bottom-right button → single sheet (slot + type + details).
  const [adding, setAdding] = useState(false);
  const [addSlot, setAddSlot] = useState<Slot | null>(null);
  const [kind, setKind] = useState<AddKind>("recipe");
  const [pickRecipe, setPickRecipe] = useState<number | null>(null);
  const [pickServings, setPickServings] = useState(2);
  // direct product item
  const [pickProduct, setPickProduct] = useState<number | null>(null);
  const [pickVariant, setPickVariant] = useState<number | null>(null);
  const [variants, setVariants] = useState<{ id: number; name: string; servingSize: number | null }[]>([]);
  // servings and canonical-unit amount (e.g. grams) — kept in sync; either can be typed
  const [pickProductServings, setPickProductServings] = useState("");
  const [pickProductAmount, setPickProductAmount] = useState("");
  // direct ingredient item
  const [pickIngredient, setPickIngredient] = useState<number | null>(null);
  const [pickAmount, setPickAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Repeat (recurring rule) state.
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<boolean[]>(() => Array(7).fill(true));
  const [intervalN, setIntervalN] = useState(1);
  const [unit, setUnit] = useState<"day" | "week">("day");
  const [until, setUntil] = useState("");

  // Tracks the range the most recently *issued* loadEvents call was for, so a
  // response can tell whether a newer request has superseded it (see below).
  const rangeRef = useRef({ from, to });
  rangeRef.current = { from, to };

  const loadEvents = useCallback(async () => {
    const reqFrom = from, reqTo = to;
    const res = await fetch(`/api/events?from=${reqFrom}&to=${reqTo}`);
    if (!res.ok) return;
    const data = (await res.json()) as MealEvent[];
    // Fast day-taps can fire several loadEvents calls before earlier ones
    // resolve; only apply the response if it's still the latest range being
    // viewed, so an older in-flight request can't overwrite newer results.
    if (reqFrom === rangeRef.current.from && reqTo === rangeRef.current.to) setEvents(data);
  }, [from, to]);

  // Slots, recipes, products, ingredients don't depend on the date range — fetch once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [sRes, rRes, pRes, iRes] = await Promise.all([
        fetch("/api/slots"),
        fetch("/api/recipes"),
        fetch("/api/products"),
        fetch("/api/ingredients"),
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
  }, []);

  // Events follow the visible window.
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const daysWithMeals = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.date);
    return set;
  }, [events]);

  const recipeName = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.name])),
    [recipes],
  );
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const ingredientName = useMemo(() => new Map(ingredients.map((i) => [i.id, i.name])), [ingredients]);
  const ingredientUnit = useMemo(() => new Map(ingredients.map((i) => [i.id, i.canonicalUnit])), [ingredients]);

  // A meal event's display title, whichever kind it is.
  function eventTitle(ev: MealEvent): string {
    if (ev.recipeId != null) return recipeName.get(ev.recipeId) ?? "Recipe";
    if (ev.variantId != null) return ev.variantName ?? productName.get(ev.productId!) ?? "Item";
    if (ev.productId != null) return productName.get(ev.productId) ?? "Item";
    if (ev.ingredientId != null) return ingredientName.get(ev.ingredientId) ?? "Item";
    return "Item";
  }

  const isToday = selected === todayIso;
  const selectedDate = new Date(selected + "T00:00:00");
  const dateLabel = selectedDate
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
  const heading = isToday
    ? greeting()
    : selectedDate.toLocaleDateString(undefined, { weekday: "long" });

  function cardsFor(slot: Slot) {
    return events
      .filter((e) => e.date === selected && e.slotId === slot.id)
      .map((ev) => (
        <MealCard
          key={ev.id}
          eventId={ev.id}
          title={eventTitle(ev)}
          servings={ev.servings}
          recipeId={ev.recipeId}
          status={ev.status}
          recurring={ev.ruleId != null}
          onCooked={loadEvents}
          onDeleted={loadEvents}
        />
      ));
  }

  // Open the add sheet, defaulted to the first slot + a recipe.
  function openAdd() {
    setAddSlot(slots[0] ?? null);
    applyKind("recipe");
    setAdding(true);
  }

  // Switch the item kind, resetting that kind's pickers to sensible defaults.
  function applyKind(k: AddKind) {
    setKind(k);
    setPickRecipe(recipes[0]?.id ?? null);
    setPickServings(k === "recipe" ? recipes[0]?.baseServings ?? 2 : 1);
    setPickProduct(null);
    setPickVariant(null);
    setVariants([]);
    setPickProductServings("");
    setPickProductAmount("");
    setPickIngredient(ingredients[0]?.id ?? null);
    setPickAmount("");
    setRepeat(false);
    setRepeatDays(Array(7).fill(true));
    setIntervalN(1);
    setUnit("day");
    setUntil("");
  }

  // Load a chosen product's variants (assorted packs need a variant pick).
  async function selectProduct(id: number) {
    setPickProduct(id);
    setPickVariant(null);
    setVariants([]);
    setPickProductServings("");
    setPickProductAmount("");
    const res = await fetch(`/api/products/${id}/variants`);
    if (!res.ok) return;
    const data = (await res.json()) as { id: number; name: string; servingSize: number | null }[];
    // If the user re-opened the picker and chose a different product before
    // this resolved, an older response landing later must not populate
    // variants for a product that's no longer selected.
    setPickProduct((cur) => {
      if (cur === id) setVariants(data);
      return cur;
    });
  }

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // One serving of the current product/variant, in the ingredient's canonical
  // unit, and that unit's label. Variant overrides the parent product.
  function servingInfo(): { perServing: number; unit: string } | null {
    const p = pickProduct != null ? productById.get(pickProduct) : undefined;
    if (!p) return null;
    const variant = pickVariant != null ? variants.find((v) => v.id === pickVariant) : undefined;
    // variant serving size wins; then the product's; else a representative variant's
    // (assorted packs keep serving size on variants, so show it before one is picked).
    const repVariant = variants.find((v) => v.servingSize && v.servingSize > 0);
    const perServing = (variant?.servingSize && variant.servingSize > 0)
      ? variant.servingSize
      : (p.servingSize && p.servingSize > 0)
        ? p.servingSize
        : (repVariant?.servingSize && repVariant.servingSize > 0 ? repVariant.servingSize : 1);
    return { perServing, unit: p.canonicalUnit };
  }

  async function saveMeal() {
    if (!addSlot || saving) return;

    // The item being planned — one of recipe / product / ingredient.
    let item: Record<string, unknown> | null = null;
    if (kind === "recipe") {
      if (pickRecipe == null) return;
      item = { recipeId: pickRecipe, servings: pickServings };
    } else if (kind === "product") {
      if (pickProduct == null) return; // variant optional: cook-time picker asks if omitted
      // whichever field the user actually typed into wins; if neither, default to 1 serving
      if (pickProductAmount !== "") {
        const amount = Number(pickProductAmount);
        if (!Number.isFinite(amount) || amount <= 0) return;
        item = { productId: pickProduct, variantId: pickVariant, amount };
      } else {
        const servings = pickProductServings !== "" ? Number(pickProductServings) : 1;
        if (!Number.isFinite(servings) || servings <= 0) return;
        item = { productId: pickProduct, variantId: pickVariant, servings };
      }
    } else {
      const amount = Number(pickAmount);
      if (pickIngredient == null || !Number.isFinite(amount) || amount <= 0) return;
      item = { ingredientId: pickIngredient, amount };
    }

    // Repeat → a recurring rule; otherwise a one-off event on the selected day.
    const url = repeat ? "/api/rules" : "/api/events";
    const body = repeat
      ? {
          ...item, slotId: addSlot.id, startDate: selected,
          intervalN, unit, daysOfWeek: repeatDays.map((d) => (d ? "1" : "0")).join(""), untilDate: until || null,
        }
      : { date: selected, slotId: addSlot.id, ...item };

    setSaving(true);
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setAdding(false);
      await loadEvents();
    }
  }

  // Recurrence controls, shown only once "Schedule…" is chosen (repeat === true).
  const repeatBlock = (
    <>
      {unit === "week" && (
        <div className="week week--repeat" role="group" aria-label="Repeat on">
          {DOW.map((label, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={repeatDays[i]}
              className={repeatDays[i] ? "day on" : "day"}
              onClick={() => setRepeatDays((ds) => ds.map((d, j) => (j === i ? !d : d)))}
            >
              <span className="dow">{label[0]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="servings-row">
        <span className="field-label" style={{ marginBottom: 0 }}>Every</span>
        <Stepper value={intervalN} min={1} onChange={setIntervalN} />
        <Dropdown
          label="Unit"
          value={unit}
          options={[
            { id: "week", label: intervalN > 1 ? "weeks" : "week" },
            { id: "day", label: intervalN > 1 ? "days" : "day" },
          ]}
          onChange={(id) => setUnit(id === "day" ? "day" : "week")}
        />
      </div>
      <div className="field">
        <span className="field-label">Until (optional)</span>
        <input
          type="date"
          className="input"
          data-empty={until ? undefined : ""}
          value={until}
          min={selected}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
    </>
  );
  // weekly repeat needs at least one day selected before we can save
  const repeatInvalid = repeat && unit === "week" && !repeatDays.some(Boolean);

  const canSave = !saving && addSlot != null && !repeatInvalid && (
    kind === "recipe" ? pickRecipe != null
    : kind === "product" ? pickProduct != null
        && !(pickProductAmount !== "" && !(Number(pickProductAmount) > 0))
        && !(pickProductServings !== "" && !(Number(pickProductServings) > 0))
    : pickIngredient != null && Number(pickAmount) > 0
  );
  const oneoffLabel = kind === "recipe" ? "Add meal" : "Add";
  const scheduleLabel = kind === "recipe" ? "Schedule meal" : "Schedule item";

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
            <p className="eb">{isToday ? `Today · ${dateLabel}` : dateLabel}</p>
            <h1>{heading}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {initials(userName)}
          </Link>
        </div>
      </header>

      <div className="content">
        <div className="week" role="tablist" aria-label="Days">
          <label className="day day--jump">
            <span className="visually-hidden">Jump to a date</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
            <span className="dow">Pick</span>
            <input
              type="date"
              value={selected}
              onChange={(e) => e.target.value && setSelected(e.target.value)}
            />
          </label>
          {!isToday && (
            <button
              type="button"
              className="day day--today"
              onClick={() => setSelected(todayIso)}
            >
              <span className="dow">Today</span>
              <span className="dnum">
                {new Date(todayIso + "T00:00:00").getDate()}
              </span>
            </button>
          )}
          {days.map((d) => {
            const iso = isoOf(d);
            const on = iso === selected;
            const hasMeals = daysWithMeals.has(iso);
            return (
              <button
                key={iso}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? "day on" : "day"}
                onClick={() => setSelected(iso)}
              >
                <span className="dow">{DOW[d.getDay()]}</span>
                <span className="dnum">{d.getDate()}</span>
                {hasMeals ? <span className="dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 22 }}>
          {loading ? (
            <div className="timeline" aria-busy="true" aria-label="Loading meal plan">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="seg">
                  <span className="node" aria-hidden="true" />
                  <Skeleton height={10} width={80} style={{ marginBottom: 8 }} />
                  <Skeleton height={72} />
                </div>
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="body">No meal slots yet. Add some in Manage.</p>
          ) : (
            <div className="timeline">
              {slots.map((slot) => {
                const cards = cardsFor(slot);
                return (
                  <div key={slot.id} className="seg">
                    <span
                      className={cards.length ? "node" : "node node--empty"}
                      aria-hidden="true"
                    />
                    <p className="slot" style={{ marginBottom: 8 }}>
                      {slot.name}
                    </p>
                    {cards.length ? <div className="stack-sm">{cards}</div> : (
                      <p className="meta" style={{ opacity: 0.6 }}>Nothing planned.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* one Add button, bottom-right; opens the slot → type → details wizard */}
      {!loading && slots.length > 0 && (
        <button
          type="button"
          className="btn fab"
          aria-label="Add to the plan"
          onClick={openAdd}
          style={{
            position: "fixed", right: 20, bottom: 84, zIndex: 20,
            width: 56, height: 56, borderRadius: 28, fontSize: 28, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,.2)",
          }}
        >
          +
        </button>
      )}

      <Sheet open={adding} title="Add to the plan" onClose={() => setAdding(false)}>
        <div className="sh-body">
          <div className="field">
            <span className="field-label">Meal</span>
            <Dropdown
              label="Meal slot"
              value={addSlot?.id ?? null}
              options={slots.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => setAddSlot(slots.find((s) => s.id === Number(id)) ?? null)}
            />
          </div>

          <div className="unit-radio">
            <button type="button" aria-pressed={kind === "recipe"} onClick={() => applyKind("recipe")}>Meal</button>
            <button type="button" aria-pressed={kind === "product"} onClick={() => applyKind("product")}>Product</button>
            <button type="button" aria-pressed={kind === "ingredient"} onClick={() => applyKind("ingredient")}>Ingredient</button>
          </div>

          {kind === "recipe" && (
            <>
              <div className="field">
                <span className="field-label">Recipe</span>
                <Dropdown
                  label="Recipe"
                  value={pickRecipe}
                  options={recipes.map((r) => ({ id: r.id, label: r.name }))}
                  onChange={(id) => setPickRecipe(Number(id))}
                />
              </div>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
                <Stepper value={pickServings} min={1} onChange={setPickServings} />
              </div>
            </>
          )}

          {kind === "product" && (
            <>
              <div className="field">
                <span className="field-label">Product</span>
                <Dropdown
                  label="Product"
                  value={pickProduct}
                  options={products.map((p) => ({ id: p.id, label: p.name }))}
                  onChange={(id) => selectProduct(Number(id))}
                />
              </div>
              {variants.length > 0 && (
                <div className="field">
                  <span className="field-label">Variant (optional)</span>
                  <Dropdown
                    label="Variant"
                    value={pickVariant}
                    options={variants.map((v) => ({ id: v.id, label: v.name }))}
                    onChange={(id) => setPickVariant(Number(id))}
                  />
                </div>
              )}
              {(() => {
                const info = servingInfo();
                const round = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

                // Each field only ever holds what the user typed into it. The
                // sibling's conversion is shown passively as its placeholder,
                // never written into its value — so typing never disturbs focus.
                const typedServings = Number(pickProductServings);
                const typedAmount = Number(pickProductAmount);
                const servingsPlaceholder =
                  info && pickProductAmount !== "" && Number.isFinite(typedAmount) && typedAmount > 0
                    ? round(typedAmount / info.perServing)
                    : "1";
                const amountPlaceholder =
                  info && pickProductServings !== "" && Number.isFinite(typedServings) && typedServings > 0
                    ? round(typedServings * info.perServing)
                    : info ? round(info.perServing) : "150";

                return (
                  <div style={{ display: "flex", gap: 12 }}>
                    <label className="field" style={{ flex: 1 }}>
                      <span className="field-label">Servings</span>
                      <input
                        className="input mono"
                        inputMode="decimal"
                        value={pickProductServings}
                        onChange={(e) => setPickProductServings(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder={servingsPlaceholder}
                      />
                    </label>
                    <label className="field" style={{ flex: 1 }}>
                      <span className="field-label">Amount{info ? ` (${info.unit})` : ""}</span>
                      <input
                        className="input mono"
                        inputMode="decimal"
                        value={pickProductAmount}
                        onChange={(e) => setPickProductAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder={info ? `${amountPlaceholder} ${info.unit}` : amountPlaceholder}
                      />
                    </label>
                  </div>
                );
              })()}
            </>
          )}

          {kind === "ingredient" && (
            <>
              <div className="field">
                <span className="field-label">Ingredient</span>
                <Dropdown
                  label="Ingredient"
                  value={pickIngredient}
                  options={ingredients.map((i) => ({ id: i.id, label: i.name }))}
                  onChange={(id) => setPickIngredient(Number(id))}
                />
              </div>
              <label className="field">
                <span className="field-label">
                  Amount{pickIngredient != null && ingredientUnit.get(pickIngredient) ? ` (${ingredientUnit.get(pickIngredient)})` : ""}
                </span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={pickAmount}
                  onChange={(e) => setPickAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 43"
                />
              </label>
            </>
          )}

          {repeat && repeatBlock}

          {!repeat ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn block" onClick={saveMeal} disabled={!canSave}>
                {saving ? "Adding…" : oneoffLabel}
              </button>
              <button type="button" className="btn-add" onClick={() => setRepeat(true)}>Schedule…</button>
            </div>
          ) : (
            <>
              <button type="button" className="btn block" onClick={saveMeal} disabled={!canSave}>
                {saving ? "Scheduling…" : scheduleLabel}
              </button>
              <button type="button" className="btn-add" onClick={() => setRepeat(false)}>← One-off instead</button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
