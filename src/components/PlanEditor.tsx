"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { MealCard } from "@/components/MealCard";

type Slot = { id: number; name: string; timeOfDay: string };
type Recipe = { id: number; name: string; baseServings: number };
type Product = { id: number; name: string };
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
  const todayIso = useMemo(todayISO, []);
  const [selected, setSelected] = useState<string>(todayIso);
  // ponytail: server can't know the client's date/timezone, so all time-derived
  // text (today, greeting, locale dates, the strip) is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The strip slides to keep `selected` in view; the events range follows it.
  const days = useMemo(() => windowAround(selected), [selected]);
  const from = isoOf(days[0]);
  const to = isoOf(days[days.length - 1]);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [variantName, setVariantName] = useState<Map<number, string>>(new Map());
  const [events, setEvents] = useState<MealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Add wizard state: one bottom-right button → slot → type → details.
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<"slot" | "type" | "details">("slot");
  const [addSlot, setAddSlot] = useState<Slot | null>(null);
  const [kind, setKind] = useState<AddKind>("recipe");
  const [pickRecipe, setPickRecipe] = useState<number | null>(null);
  const [pickServings, setPickServings] = useState(2);
  // direct product item
  const [pickProduct, setPickProduct] = useState<number | null>(null);
  const [pickVariant, setPickVariant] = useState<number | null>(null);
  const [variants, setVariants] = useState<{ id: number; name: string }[]>([]);
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

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/events?from=${from}&to=${to}`);
    if (!res.ok) return;
    const evs = (await res.json()) as MealEvent[];
    setEvents(evs);
    // resolve variant names for any direct product-variant items shown
    const pids = [...new Set(evs.filter((e) => e.variantId != null && e.productId != null).map((e) => e.productId!))];
    if (pids.length) {
      const lists = await Promise.all(
        pids.map((pid) => fetch(`/api/products/${pid}/variants`).then((r) => (r.ok ? r.json() : []))),
      );
      const m = new Map<number, string>();
      for (const list of lists) for (const v of list as { id: number; name: string }[]) m.set(v.id, v.name);
      setVariantName(m);
    }
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
    if (ev.variantId != null) return variantName.get(ev.variantId) ?? productName.get(ev.productId!) ?? "Item";
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

  // Step 1 of the Add wizard: open the sheet and ask for a slot.
  function openAdd() {
    setAddSlot(null);
    setStep("slot");
    setAdding(true);
  }

  // Step 1 → 2: slot chosen, ask for the kind.
  function chooseSlot(slot: Slot) {
    setAddSlot(slot);
    setStep("type");
  }

  // Step 2 → 3: kind chosen, show the matching picker with sensible defaults.
  function chooseKind(k: AddKind) {
    setKind(k);
    setPickRecipe(recipes[0]?.id ?? null);
    setPickServings(k === "recipe" ? recipes[0]?.baseServings ?? 2 : 1);
    setPickProduct(null);
    setPickVariant(null);
    setVariants([]);
    setPickIngredient(ingredients[0]?.id ?? null);
    setPickAmount("");
    setRepeat(false);
    setRepeatDays(Array(7).fill(true));
    setIntervalN(1);
    setUnit("day");
    setUntil("");
    setStep("details");
  }

  // Load a chosen product's variants (assorted packs need a variant pick).
  async function selectProduct(id: number) {
    setPickProduct(id);
    setPickVariant(null);
    setVariants([]);
    const res = await fetch(`/api/products/${id}/variants`);
    if (res.ok) setVariants((await res.json()) as { id: number; name: string }[]);
  }

  async function saveMeal() {
    if (!addSlot || saving) return;
    let body: Record<string, unknown> | null = null;
    let url = "/api/events";
    if (kind === "recipe") {
      if (pickRecipe == null) return;
      if (repeat) {
        url = "/api/rules";
        body = {
          startDate: selected, slotId: addSlot.id, recipeId: pickRecipe, servings: pickServings,
          intervalN, unit, daysOfWeek: repeatDays.map((d) => (d ? "1" : "0")).join(""), untilDate: until || null,
        };
      } else {
        body = { date: selected, slotId: addSlot.id, recipeId: pickRecipe, servings: pickServings };
      }
    } else if (kind === "product") {
      if (pickProduct == null || (variants.length > 0 && pickVariant == null)) return;
      body = { date: selected, slotId: addSlot.id, productId: pickProduct, variantId: pickVariant, servings: pickServings };
    } else {
      const amount = Number(pickAmount);
      if (pickIngredient == null || !Number.isFinite(amount) || amount <= 0) return;
      body = { date: selected, slotId: addSlot.id, ingredientId: pickIngredient, amount };
    }
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
            <p className="loading">Loading…</p>
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

      <Sheet
        open={adding}
        title={
          step === "slot" ? "Add to which meal?"
          : step === "type" ? `${addSlot?.name ?? ""} — what are you adding?`
          : `Add to ${addSlot?.name ?? ""}`
        }
        onClose={() => setAdding(false)}
      >
        {step === "slot" && (
          <div className="sh-body stack-sm">
            {slots.map((slot) => (
              <button key={slot.id} type="button" className="btn block" onClick={() => chooseSlot(slot)}>
                {slot.name}
              </button>
            ))}
          </div>
        )}

        {step === "type" && (
          <div className="sh-body stack-sm">
            <button type="button" className="btn block" onClick={() => chooseKind("recipe")}>Meal (recipe)</button>
            <button type="button" className="btn block" onClick={() => chooseKind("product")}>Product</button>
            <button type="button" className="btn block" onClick={() => chooseKind("ingredient")}>Ingredient</button>
            <button type="button" className="btn-add" onClick={() => setStep("slot")}>← Back</button>
          </div>
        )}

        {step === "details" && kind === "recipe" && (
        <div className="sh-body">
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
            <span className="field-label" style={{ marginBottom: 0 }}>
              Servings
            </span>
            <Stepper value={pickServings} min={1} onChange={setPickServings} />
          </div>

          <div className="servings-row">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Repeat
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={repeat}
              className={repeat ? "btn" : "btn-add"}
              onClick={() => setRepeat((v) => !v)}
            >
              {repeat ? "On" : "Off"}
            </button>
          </div>

          {repeat && (
            <>
              {unit === "week" && (
                <div className="week week--repeat" role="group" aria-label="Repeat on">
                  {DOW.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={repeatDays[i]}
                      className={repeatDays[i] ? "day on" : "day"}
                      onClick={() =>
                        setRepeatDays((ds) => ds.map((d, j) => (j === i ? !d : d)))
                      }
                    >
                      <span className="dow">{label[0]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>
                  Every
                </span>
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
          )}

          <button
            type="button"
            className="btn block"
            onClick={saveMeal}
            disabled={
              saving ||
              pickRecipe == null ||
              (repeat && unit === "week" && !repeatDays.some(Boolean))
            }
          >
            {saving ? "Adding…" : repeat ? "Add repeating meal" : "Add meal"}
          </button>
          <button type="button" className="btn-add" onClick={() => setStep("type")}>← Back</button>
        </div>
        )}

        {step === "details" && kind === "product" && (
          <div className="sh-body">
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
                <span className="field-label">Variant</span>
                <Dropdown
                  label="Variant"
                  value={pickVariant}
                  options={variants.map((v) => ({ id: v.id, label: v.name }))}
                  onChange={(id) => setPickVariant(Number(id))}
                />
              </div>
            )}
            <div className="servings-row">
              <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
              <Stepper value={pickServings} min={1} onChange={setPickServings} />
            </div>
            <button
              type="button"
              className="btn block"
              onClick={saveMeal}
              disabled={saving || pickProduct == null || (variants.length > 0 && pickVariant == null)}
            >
              {saving ? "Adding…" : "Add"}
            </button>
            <button type="button" className="btn-add" onClick={() => setStep("type")}>← Back</button>
          </div>
        )}

        {step === "details" && kind === "ingredient" && (
          <div className="sh-body">
            <div className="field">
              <span className="field-label">Ingredient</span>
              <Dropdown
                label="Ingredient"
                value={pickIngredient}
                options={ingredients.map((i) => ({ id: i.id, label: i.name }))}
                onChange={(id) => setPickIngredient(Number(id))}
              />
            </div>
            <div className="field">
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
            </div>
            <button
              type="button"
              className="btn block"
              onClick={saveMeal}
              disabled={saving || pickIngredient == null || !(Number(pickAmount) > 0)}
            >
              {saving ? "Adding…" : "Add"}
            </button>
            <button type="button" className="btn-add" onClick={() => setStep("type")}>← Back</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
