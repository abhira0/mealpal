import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { type CookAllocations, consumptionLinesForEvent, recordCookedForEvent } from "@/lib/consumption";
import { skipDay, endSeriesFrom, deleteRule } from "@/lib/rules";

type Db = BetterSQLite3Database<typeof schema>;

export type DeleteScope = "one" | "following" | "all";

// A meal event is one kind: recipe (recipeId), direct ingredient (ingredientId
// + amount), or direct product (productId, optional variantId, + servings).
export interface EventInput {
  date: string; slotId: number; servings: number;
  recipeId?: number | null;
  ingredientId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  amount?: number | null;
}

// Resolve the stored servings + canonical amount for an event's item kind,
// mirroring the plan wizard: recipe/ingredient keep servings/amount as given;
// a direct product converts between servings and amount via its serving size.
function resolveQuantity(db: Db, householdId: number, input: EventInput): { servings: number; amount: number | null } {
  let servings = input.servings || 1;
  let amount: number | null = null;
  if (input.productId != null) {
    const [p] = db.select({ s: schema.products.servingSize }).from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    let perServing = p?.s && p.s > 0 ? p.s : 1;
    if (input.variantId != null) {
      const [v] = db.select({ s: schema.productVariants.servingSize }).from(schema.productVariants)
        .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.householdId, householdId))).all();
      if (v?.s && v.s > 0) perServing = v.s;
    }
    if (input.amount != null && input.amount > 0) {
      // logged directly in canonical units — back-derive servings for display
      amount = input.amount;
      servings = amount / perServing;
    } else {
      amount = servings * perServing;
    }
  } else if (input.ingredientId != null) {
    amount = input.amount ?? 0;
  }
  return { servings, amount };
}

export function addEvent(db: Db, householdId: number, input: EventInput) {
  const { servings, amount } = resolveQuantity(db, householdId, input);
  const [row] = db.insert(schema.mealEvents)
    .values({
      householdId, date: input.date, slotId: input.slotId, servings, status: "planned",
      recipeId: input.recipeId ?? null, ingredientId: input.ingredientId ?? null,
      productId: input.productId ?? null, variantId: input.variantId ?? null, amount,
    }).returning().all();
  return row;
}

/** One event, or null. */
export function getEvent(db: Db, householdId: number, eventId: number) {
  const [row] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  return row ?? null;
}

/**
 * Edit a still-planned event in place: swap its item (recipe/product/ingredient),
 * slot, date, or quantity. Refuses once cooked/served (stock is committed then —
 * undo first). Returns the updated row, or null if missing / not planned.
 */
export function updateEvent(db: Db, householdId: number, eventId: number, input: EventInput) {
  const existing = getEvent(db, householdId, eventId);
  if (!existing || existing.status !== "planned") return null;
  const { servings, amount } = resolveQuantity(db, householdId, input);
  const [row] = db.update(schema.mealEvents)
    .set({
      date: input.date, slotId: input.slotId, servings,
      recipeId: input.recipeId ?? null, ingredientId: input.ingredientId ?? null,
      productId: input.productId ?? null, variantId: input.variantId ?? null, amount,
    })
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId)))
    .returning().all();
  return row;
}

export function listEvents(db: Db, householdId: number, from: string, to: string) {
  const events = db.select().from(schema.mealEvents)
    .where(and(
      eq(schema.mealEvents.householdId, householdId),
      gte(schema.mealEvents.date, from),
      lte(schema.mealEvents.date, to),
    ))
    .orderBy(asc(schema.mealEvents.date)).all();
  // attach pack-variant names so clients don't need a fetch per product
  const ids = [...new Set(events.flatMap((e) => (e.variantId != null ? [e.variantId] : [])))];
  const names = ids.length
    ? new Map(
        db.select({ id: schema.productVariants.id, name: schema.productVariants.name })
          .from(schema.productVariants)
          .where(and(
            eq(schema.productVariants.householdId, householdId),
            inArray(schema.productVariants.id, ids),
          )).all().map((v) => [v.id, v.name]),
      )
    : new Map<number, string>();
  return events.map((e) => ({
    ...e,
    variantName: e.variantId != null ? names.get(e.variantId) ?? null : null,
  }));
}

/**
 * Sum of planned (not yet cooked) consumption per ingredient over [from, to].
 * When `shelfLife` is given, an ingredient only accrues meals dated within its
 * own window — `min(to, from + shelfLife[id])` — so perishables aren't bought
 * further ahead than they'll keep. Shelf life can only pull the cutoff earlier.
 */
export function plannedConsumption(
  db: Db, householdId: number, from: string, to: string,
  shelfLife?: Map<number, number>,
): Map<number, number> {
  const events = listEvents(db, householdId, from, to).filter((e) => e.status === "planned");
  const fromMs = Date.parse(from);
  const map = new Map<number, number>();
  for (const ev of events) {
    for (const line of consumptionLinesForEvent(db, householdId, ev)) {
      const life = shelfLife?.get(line.ingredientId);
      if (life !== undefined) {
        const daysOut = Math.round((Date.parse(ev.date) - fromMs) / 86_400_000);
        if (daysOut > life) continue; // past this ingredient's window — skip
      }
      map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount);
    }
  }
  return map;
}

/**
 * First date each ingredient's running stock is used up (hits zero or below),
 * walking planned meals forward from `from`. Real consumption — no shelf-life
 * clamp. Ingredients that never run dry within [from, to] are omitted. When
 * `expiry` (ingredientId → YYYY-MM-DD) is given, stock left after that date is
 * spoiled: meals dated past it start from zero, so run-out lands on the first
 * use after expiry.
 */
export function runOutDates(
  db: Db, householdId: number, from: string, to: string, stock: Map<number, number>,
  expiry?: Map<number, string>,
): Map<number, string> {
  const events = listEvents(db, householdId, from, to).filter((e) => e.status === "planned");
  const remaining = new Map(stock); // mutate a copy as we burn it down
  const out = new Map<number, string>();
  for (const ev of events) {
    for (const line of consumptionLinesForEvent(db, householdId, ev)) {
      if (out.has(line.ingredientId)) continue; // already dated
      const exp = expiry?.get(line.ingredientId);
      const have = exp !== undefined && ev.date > exp
        ? Math.min(remaining.get(line.ingredientId) ?? 0, 0) // ponytail: soonest expiry spoils the whole pile; per-batch FIFO if mixed batches matter
        : remaining.get(line.ingredientId) ?? 0;
      const left = have - line.amount;
      remaining.set(line.ingredientId, left);
      // <= 0: "out" is the day the last of it gets used, not the first unmet meal
      if (left <= 0) out.set(line.ingredientId, ev.date);
    }
  }
  return out;
}

/**
 * Delete a planned event. For rule-generated meals, `scope` chooses the reach
 * (Google-Calendar style): just this day, this + all future, or the whole series.
 * Cooked events are kept (stock already moved).
 */
export function deleteEvent(db: Db, householdId: number, eventId: number, scope: DeleteScope = "one") {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev) return;
  // A cooked or served event owns stock movements; drop them first so removing
  // it also backs out its stock/nutrition, then delete as usual.
  if (ev.status === "cooked" || ev.status === "served") {
    db.delete(schema.stockMovements)
      .where(and(
        eq(schema.stockMovements.householdId, householdId),
        eq(schema.stockMovements.mealEventId, ev.id),
      )).run();
  }
  if (!ev.ruleId || scope === "one") {
    if (ev.ruleId) skipDay(db, ev.ruleId, ev.date, ev.slotId);
    else db.delete(schema.mealEvents).where(eq(schema.mealEvents.id, ev.id)).run();
  } else if (scope === "following") {
    endSeriesFrom(db, householdId, ev.ruleId, ev.date);
  } else {
    deleteRule(db, householdId, ev.ruleId);
  }
}

/**
 * Mark an event cooked exactly once: deplete stock and flip status.
 * `cookedAhead` records whether this is an explicit "cook ahead" (true) or a
 * depletion that happens as part of serving (false) — un-serve reads it to pick
 * the right prior state to return to.
 */
export function cookEvent(
  db: Db, householdId: number, eventId: number, allocations?: CookAllocations, cookedAhead = false,
) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status === "cooked" || ev.status === "served") return; // no-op if missing or already cooked/served

  // Direct product planned without a variant: resolve the cook-time variant and
  // recompute the canonical amount from ITS serving size (the plan stored a
  // product-based amount since the serving size lives on the variant). This
  // resolution feeds the stock movement only — it is NOT written back to the
  // event, so the event stays the plan and undo (uncookEvent) returns cleanly.
  let effective = ev;
  if (ev.productId != null && ev.variantId == null && allocations) {
    const line = consumptionLinesForEvent(db, householdId, ev)[0];
    const chosen = line ? allocations.get(line.ingredientId)?.variantId ?? null : null;
    if (chosen != null) {
      const [v] = db.select({ s: schema.productVariants.servingSize }).from(schema.productVariants)
        .where(and(eq(schema.productVariants.id, chosen), eq(schema.productVariants.householdId, householdId))).all();
      const perServing = v?.s && v.s > 0 ? v.s : 1;
      const amount = Math.round(ev.servings * perServing);
      effective = { ...ev, variantId: chosen, amount };
    }
  }

  recordCookedForEvent(db, householdId, effective, allocations);
  db.update(schema.mealEvents).set({ status: "cooked", cookedAhead })
    .where(eq(schema.mealEvents.id, ev.id)).run();
}

/** Reverse cookEvent: drop the stock movements it logged and flip status back. */
export function uncookEvent(db: Db, householdId: number, eventId: number) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status !== "cooked") return; // no-op if missing or not cooked
  db.delete(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      eq(schema.stockMovements.mealEventId, ev.id),
    )).run();
  db.update(schema.mealEvents).set({ status: "planned", cookedAhead: false })
    .where(eq(schema.mealEvents.id, ev.id)).run();
}

/**
 * Mark an event served: the one action that counts toward nutrition. If it's
 * still 'planned', deplete stock first (same path cookEvent uses) then flip
 * straight to 'served'. If it's already 'cooked', stock was depleted at cook
 * time — just flip the status, no second depletion.
 */
export function serveEvent(
  db: Db, householdId: number, eventId: number, allocations?: CookAllocations,
) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status === "served") return; // no-op if missing or already served
  if (ev.status === "planned") cookEvent(db, householdId, eventId, allocations); // depletes stock, sets 'cooked'
  db.update(schema.mealEvents).set({ status: "served" })
    .where(eq(schema.mealEvents.id, ev.id)).run();
}

/**
 * Reverse serveEvent, returning to the state serving came FROM: 'cooked' if the
 * meal was explicitly cooked ahead (stock stays depleted), otherwise all the way
 * back to 'planned' with the serve's stock movements backed out.
 */
export function unserveEvent(db: Db, householdId: number, eventId: number) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status !== "served") return; // no-op if missing or not served
  db.update(schema.mealEvents).set({ status: "cooked" })
    .where(eq(schema.mealEvents.id, ev.id)).run();
  if (!ev.cookedAhead) uncookEvent(db, householdId, eventId); // served directly → fully reverse to planned
}
