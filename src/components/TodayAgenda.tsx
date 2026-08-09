"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { todayISO } from "@/lib/dates";

type Batch = { id: number; slotId: number; label: string; cookedDate: string; mealsTotal: number; mealsRemaining: number };
type Slot = { id: number; name: string; timeOfDay: string };
type Recipe = { id: number; name: string; baseServings: number };
type Product = { id: number; name: string; servingSize: number | null; canonicalUnit: string };

type ItemKind = "recipe" | "product";
type PackItem = { kind: ItemKind; refId: number | null; amount: string };

// Subset of GET /api/nutrition/analysis?mode=day&date=... used here — eaten
// ("nutrients") vs planned ("planned") totals, scaled to the household goal.
type DayAnalysis = {
  goals: { calorieGoal: number; proteinG: number; carbsG: number; fatG: number };
  nutrients: { calories: number; proteinG: number };
  planned: { calories: number; proteinG: number };
};

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export function TodayAgenda({ userName }: { userName?: string | null }) {
  // ponytail: server can't know the client's date/timezone, so all
  // time-derived text is client-only to avoid hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const todayIso = useMemo(todayISO, []);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/batches");
    if (res.ok) setBatches((await res.json()) as Batch[]);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [bRes, sRes, rRes, pRes] = await Promise.all([
        fetch("/api/batches"),
        fetch("/api/slots"),
        fetch("/api/recipes"),
        fetch("/api/products"),
      ]);
      if (!alive) return;
      if (bRes.ok) setBatches((await bRes.json()) as Batch[]);
      if (sRes.ok) setSlots((await sRes.json()) as Slot[]);
      if (rRes.ok) setRecipes((await rRes.json()) as Recipe[]);
      if (pRes.ok) setProducts((await pRes.json()) as Product[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const slotName = useMemo(() => new Map(slots.map((s) => [s.id, s.name])), [slots]);

  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    fetch(`/api/nutrition/analysis?mode=day&date=${todayISO()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setAnalysis(d); })
      .catch(() => { if (!cancelled) setAnalysis(null); });
    return () => { cancelled = true; };
  }, [mounted, batches]);

  async function eatOne(batch: Batch) {
    if (batch.mealsRemaining <= 0) return;
    // optimistic decrement, then reconcile from the response
    setBatches((prev) =>
      prev.map((b) => (b.id === batch.id ? { ...b, mealsRemaining: b.mealsRemaining - 1 } : b)),
    );
    const res = await fetch(`/api/batches/${batch.id}/eat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayISO() }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Batch;
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? updated : b)));
    } else {
      // reconcile from the server on failure too
      await loadBatches();
    }
  }

  // Pack-a-batch sheet state.
  const [packOpen, setPackOpen] = useState(false);
  const [packSlotId, setPackSlotId] = useState<number | null>(null);
  const [packLabel, setPackLabel] = useState("");
  const [packMeals, setPackMeals] = useState(4);
  const [packItems, setPackItems] = useState<PackItem[]>([{ kind: "recipe", refId: null, amount: "" }]);
  const [packing, setPacking] = useState(false);

  function openPack() {
    setPackSlotId(slots[0]?.id ?? null);
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
        cookedDate: todayISO(),
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
      await loadBatches();
    }
  }

  const dateLabel = new Date(todayIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

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
        ) : batches.length === 0 ? (
          <p className="empty">No active batches — pack one below.</p>
        ) : (
          <div className="stack-sm">
            {batches.map((b) => {
              const empty = b.mealsRemaining <= 0;
              const low = b.mealsRemaining <= 1 && !empty;
              return (
                <div key={b.id} className="card" style={empty ? { opacity: 0.5 } : undefined}>
                  <div className="card-row">
                    <span className="title row-main">{b.label}</span>
                    <span className={low || empty ? "chip run" : "chip"}>
                      {empty ? "empty · cook" : low ? "1 left · cook soon" : `${b.mealsRemaining} left`}
                    </span>
                  </div>
                  <div className="card-row" style={{ marginTop: 12 }}>
                    <span className="slot">{slotName.get(b.slotId) ?? ""}</span>
                    <button type="button" className="btn" disabled={empty} onClick={() => eatOne(b)}>
                      Ate one
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Disabled while loading: opening early locks the default item's
            refId to null (recipes/products not fetched yet), leaving the
            pack form stuck invalid. */}
        <button type="button" className="btn block" disabled={loading} onClick={openPack}>
          ＋ Pack a batch
        </button>

        <Link href="/plan" className="btn-link">
          Open full planner
        </Link>
      </div>

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
    </>
  );
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
