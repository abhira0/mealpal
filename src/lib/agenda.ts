import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { listBatches } from "@/lib/batches";
import { unstockedIngredients } from "@/lib/consumption";
import { localNoon, toISODate } from "@/lib/dates";

type Db = BetterSQLite3Database<typeof schema>;

export interface AgendaMeal {
  eventId: number | null; // null for a synthetic batch-projected row (no meal_event backs it)
  slotId: number;
  slotName: string;
  name: string; // resolved meal name
  recipeId: number | null; // item identity, for linking the name to its detail page
  productId: number | null;
  ingredientId: number | null;
  status: "planned" | "cooked" | "served";
  phase: "planned" | "cooked" | "served"; // lifecycle phase for the UI's status chip
  cookedAhead: boolean; // stock depleted by an explicit cook-ahead — un-serve returns to 'cooked', else 'planned'
  batchBacked: boolean; // an active batch exists for this slot
  batchId: number | null; // that batch's id, or null
  mealsRemaining: number | null; // that batch's remaining, or null
  eatenFromBatchToday: boolean; // a batch_eaten row exists for (batchId, this date)
  ruleId: number | null; // the recurring rule that generated this event, or null for one-offs
  outOfStock: boolean; // planned rotation meal whose ingredients aren't fully in stock
  missingItems: string[]; // those ingredients' names, when outOfStock
}

export interface CookFlag {
  slotId: number;
  slotName: string;
  label: string;
}

export interface NextCook {
  slotId: number;
  slotName: string;
  label: string;
  cookDate: string;
  daysAway: number; // negative when cookDate is in the past (overdue prep)
}

export interface AgendaDay {
  date: string;
  meals: AgendaMeal[]; // ordered by slot timeOfDay
  cookFlags: CookFlag[]; // slots whose active batch runs out ON this date
  eatenCount: number; // meals considered done this day
  totalCount: number; // meals.length
}

/**
 * Lifecycle phase for a meal row's status chip: "served" once it's actually
 * been eaten (counts toward nutrition) — status 'served' or eaten from a
 * batch today; "cooked" once stock's been depleted but it hasn't been eaten
 * yet — status 'cooked' or a batch serving that's ready but untouched today;
 * else "planned".
 */
function derivePhase(m: {
  eatenFromBatchToday: boolean;
  status: "planned" | "cooked" | "served";
  batchBacked: boolean;
}): "planned" | "cooked" | "served" {
  if (m.status === "served" || m.eatenFromBatchToday) return "served";
  if (m.status === "cooked" || m.batchBacked) return "cooked";
  return "planned";
}

/** ISO date + n days, computed in local time (no UTC drift). */
function addDays(date: string, n: number): string {
  return toISODate(new Date(localNoon(date).getTime() + n * 86_400_000));
}

// Days to cook ahead of when a meal is eaten: morning/lunch meals get prepped
// the night before (overnight oats, packed lunch), dinner is cooked same-day.
// ponytail: threshold on the slot's timeOfDay — slots at/after 17:00 are dinner.
// A per-slot "cook ahead" field would generalize this; deferred until needed.
function cookLead(timeOfDay: string | undefined): number {
  return (timeOfDay ?? "12:00") < "17:00" ? 1 : 0;
}

/** Every date in [from, to] inclusive. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let d = from;
  while (d <= to) {
    dates.push(d);
    d = addDays(d, 1);
  }
  return dates;
}

/**
 * Day-by-day agenda for [from, to]: the rotation's meal events, overlaid with
 * active batches (so a batch-backed slot shows remaining servings and whether
 * today's serving was eaten) and cook-day flags (when a batch is projected to
 * run out, assuming one serving eaten per day starting today).
 */
export function agendaDays(
  db: Db,
  householdId: number,
  from: string,
  to: string,
  today: string,
): AgendaDay[] {
  const slots = db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId)).all();
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const events = db.select().from(schema.mealEvents)
    .where(and(
      eq(schema.mealEvents.householdId, householdId),
      gte(schema.mealEvents.date, from),
      lte(schema.mealEvents.date, to),
    )).all();

  const eventsByDate = new Map<string, typeof events>();
  for (const ev of events) {
    const bucket = eventsByDate.get(ev.date);
    if (bucket) bucket.push(ev);
    else eventsByDate.set(ev.date, [ev]);
  }

  const ingredientById = new Map(
    db.select().from(schema.ingredients).where(eq(schema.ingredients.householdId, householdId)).all()
      .map((i) => [i.id, i]),
  );
  const productById = new Map(
    db.select().from(schema.products).where(eq(schema.products.householdId, householdId)).all()
      .map((p) => [p.id, p]),
  );
  const variantById = new Map(
    db.select().from(schema.productVariants).where(eq(schema.productVariants.householdId, householdId)).all()
      .map((v) => [v.id, v]),
  );

  const activeBatches = listBatches(db, householdId); // newest cookedDate first

  // what each active batch actually made, so it only decorates its own meals —
  // not every unrelated recipe that happens to share its slot.
  const activeBatchIds = new Set(activeBatches.map((b) => b.id));
  const batchRecipeIds = new Map<number, Set<number>>();
  const batchProductIds = new Map<number, Set<number>>();
  for (const it of db.select().from(schema.batchItems).all()) {
    if (!activeBatchIds.has(it.batchId)) continue;
    if (it.recipeId != null) {
      (batchRecipeIds.get(it.batchId) ?? batchRecipeIds.set(it.batchId, new Set()).get(it.batchId)!).add(it.recipeId);
    }
    if (it.productId != null) {
      (batchProductIds.get(it.batchId) ?? batchProductIds.set(it.batchId, new Set()).get(it.batchId)!).add(it.productId);
    }
  }

  // A batch covers days until its servings run out, not a fixed calendar span:
  // skip a day and the remaining servings slide forward. Past days keep their
  // rows (cookedDate onwards); the future end is today + what's left.
  const coverageEnd = (b: (typeof activeBatches)[number]): string =>
    addDays(b.cookedDate > today ? b.cookedDate : today, b.mealsRemaining - 1);

  // Does batch b back this event on `date`? Only within its coverage window
  // AND if b actually made this event's recipe/product. Prevents a batch
  // leaking its "N left"/COOKED badge onto other meals in the same slot or
  // onto dates it never covered.
  const batchBacksEvent = (
    b: (typeof activeBatches)[number],
    ev: (typeof events)[number],
    date: string,
  ): boolean => {
    if (date < b.cookedDate || date > coverageEnd(b)) return false;
    const recipes = batchRecipeIds.get(b.id);
    const products = batchProductIds.get(b.id);
    if (!recipes && !products) return true; // item-less batch: backs any meal in its slot
    if (ev.recipeId != null && recipes?.has(ev.recipeId)) return true;
    if (ev.productId != null && products?.has(ev.productId)) return true;
    return false;
  };

  const batchEatenRows = db.select().from(schema.batchEaten)
    .where(eq(schema.batchEaten.householdId, householdId)).all();
  const eatenKeys = new Set(batchEatenRows.map((r) => `${r.batchId}:${r.date}`));

  function resolveName(ev: (typeof events)[number]): string {
    if (ev.recipeId != null) {
      return getRecipe(db, householdId, ev.recipeId)?.name ?? "Item";
    }
    if (ev.productId != null) {
      const variant = ev.variantId != null ? variantById.get(ev.variantId) : undefined;
      const p = productById.get(ev.productId);
      if (!p) return variant?.name ?? "Item";
      return variant ? `${p.name} · ${variant.name}` : p.name;
    }
    if (ev.ingredientId != null) {
      return ingredientById.get(ev.ingredientId)?.name ?? "Item";
    }
    return "Item";
  }

  // day -> cook flags landing on it: the day AFTER each active batch's coverage
  // window ends, i.e. right after its last covered day.
  const cookFlagsByDate = new Map<string, CookFlag[]>();
  for (const b of activeBatches) {
    const slot = slotById.get(b.slotId);
    const cookDate = addDays(coverageEnd(b), 1 - cookLead(slot?.timeOfDay));
    if (cookDate < from || cookDate > to) continue;
    const flag: CookFlag = { slotId: b.slotId, slotName: slot?.name ?? "—", label: b.label };
    const bucket = cookFlagsByDate.get(cookDate);
    if (bucket) bucket.push(flag);
    else cookFlagsByDate.set(cookDate, [flag]);
  }

  // day -> synthetic batch meal rows: for each active batch's coverage window,
  // project a meal row onto every covered day that has no real meal_event for
  // that batch's slot already.
  const syntheticByDate = new Map<string, (AgendaMeal & { _timeOfDay: string })[]>();
  for (const b of activeBatches) {
    const slot = slotById.get(b.slotId);
    for (const d of dateRange(b.cookedDate, coverageEnd(b))) {
      if (d < from || d > to) continue;
      const dayEvents = eventsByDate.get(d) ?? [];
      // a real event for THIS batch's meal wins (no duplicate); an unrelated
      // meal sharing the slot doesn't suppress the batch's own row.
      if (dayEvents.some((ev) => ev.slotId === b.slotId && batchBacksEvent(b, ev, d))) continue;
      const eatenFromBatchToday = eatenKeys.has(`${b.id}:${d}`);
      const status: "planned" | "cooked" = eatenFromBatchToday ? "cooked" : "planned";
      const meal: AgendaMeal & { _timeOfDay: string } = {
        eventId: null,
        slotId: b.slotId,
        slotName: slot?.name ?? "—",
        name: b.label,
        recipeId: null, // a batch row is not a single recipe/product — no redirect
        productId: null,
        ingredientId: null,
        status,
        phase: derivePhase({ eatenFromBatchToday, status, batchBacked: true }),
        cookedAhead: false, // batches deplete at pack time, not via cook-ahead
        batchBacked: true,
        batchId: b.id,
        mealsRemaining: b.mealsRemaining,
        eatenFromBatchToday,
        ruleId: null,
        outOfStock: false, // batch rows already consumed their stock at pack time
        missingItems: [],
        _timeOfDay: slot?.timeOfDay ?? "12:00",
      };
      const bucket = syntheticByDate.get(d);
      if (bucket) bucket.push(meal);
      else syntheticByDate.set(d, [meal]);
    }
  }

  return dateRange(from, to).map((date) => {
    const dayEvents = eventsByDate.get(date) ?? [];
    const meals: AgendaMeal[] = dayEvents
      .map((ev): AgendaMeal & { _timeOfDay: string } => {
        const slot = slotById.get(ev.slotId);
        const batch = activeBatches.find((b) => b.slotId === ev.slotId && batchBacksEvent(b, ev, date)) ?? null;
        const batchBacked = batch != null;
        const eatenFromBatchToday = batchBacked && eatenKeys.has(`${batch!.id}:${date}`);
        const status = ev.status as "planned" | "cooked" | "served";
        const phase = derivePhase({ eatenFromBatchToday, status, batchBacked });
        // Only a real, planned rotation meal (not cooked/served, not batch-backed)
        // can be flagged: batches already consumed their stock at pack time, and
        // cooked/served meals already happened.
        const missingItems = phase === "planned" ? unstockedIngredients(db, householdId, ev.id) : [];
        return {
          eventId: ev.id,
          slotId: ev.slotId,
          slotName: slot?.name ?? "—",
          name: resolveName(ev),
          recipeId: ev.recipeId,
          productId: ev.productId,
          ingredientId: ev.ingredientId,
          status,
          phase,
          cookedAhead: ev.cookedAhead,
          batchBacked,
          batchId: batch ? batch.id : null,
          mealsRemaining: batch ? batch.mealsRemaining : null,
          eatenFromBatchToday,
          ruleId: ev.ruleId,
          outOfStock: missingItems.length > 0,
          missingItems,
          _timeOfDay: slot?.timeOfDay ?? "12:00",
        };
      })
      .concat(syntheticByDate.get(date) ?? [])
      .sort((a, b) => a._timeOfDay.localeCompare(b._timeOfDay))
      .map(({ _timeOfDay, ...m }) => m);

    const eatenCount = meals.filter((m) => m.phase === "served").length;

    return {
      date,
      meals,
      cookFlags: cookFlagsByDate.get(date) ?? [],
      eatenCount,
      totalCount: meals.length,
    };
  });
}

/**
 * Next meal-prep date per slot: for each active batch, its cook date is the
 * day after its remaining servings run out (today + mealsRemaining, same math
 * as agendaDays' cook flags). A slot with multiple active batches keeps
 * only the one that runs out soonest. Sorted by cookDate ascending.
 */
export function nextCooks(db: Db, householdId: number, today: string): NextCook[] {
  const slots = db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId)).all();
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const activeBatches = listBatches(db, householdId);
  const bySlot = new Map<number, { cookDate: string; label: string }>();
  for (const b of activeBatches) {
    const start = b.cookedDate > today ? b.cookedDate : today;
    const cookDate = addDays(start, b.mealsRemaining - cookLead(slotById.get(b.slotId)?.timeOfDay));
    const existing = bySlot.get(b.slotId);
    if (!existing || cookDate < existing.cookDate) {
      bySlot.set(b.slotId, { cookDate, label: b.label });
    }
  }

  const todayMs = localNoon(today).getTime();
  // Negative daysAway means the cook date has already passed (overdue prep);
  // callers should treat daysAway < 0 as overdue rather than clamping to "today".
  const daysFrom = (date: string) =>
    Math.round((localNoon(date).getTime() - todayMs) / 86_400_000);

  const result: NextCook[] = [];
  for (const [slotId, { cookDate, label }] of bySlot) {
    const slot = slotById.get(slotId);
    result.push({ slotId, slotName: slot?.name ?? "—", label, cookDate, daysAway: daysFrom(cookDate) });
  }

  // Recurring recipe meals (make-ahead items like Overnight Oats) also surface
  // here: a recipe's prep date is its next upcoming *planned* occurrence.
  // ponytail: this includes every recurring recipe meal (smoothies, toast, …),
  // not only make-ahead ones — a `mealPrep` flag on recipes would let us show
  // just true prep-ahead items; deferred (needs a schema/migration change).
  const plannedRecipeEvents = db.select().from(schema.mealEvents)
    .where(and(
      eq(schema.mealEvents.householdId, householdId),
      gte(schema.mealEvents.date, today),
      eq(schema.mealEvents.status, "planned"),
      isNotNull(schema.mealEvents.recipeId),
    )).all();
  const byRecipe = new Map<number, { date: string; slotId: number }>();
  for (const ev of plannedRecipeEvents) {
    const rid = ev.recipeId!;
    const existing = byRecipe.get(rid);
    if (!existing || ev.date < existing.date) byRecipe.set(rid, { date: ev.date, slotId: ev.slotId });
  }
  for (const [recipeId, { date, slotId }] of byRecipe) {
    const slot = slotById.get(slotId);
    const cookDate = addDays(date, -cookLead(slot?.timeOfDay));
    result.push({
      slotId,
      slotName: slot?.name ?? "—",
      label: getRecipe(db, householdId, recipeId)?.name ?? "Recipe",
      cookDate,
      daysAway: daysFrom(cookDate),
    });
  }

  return result.sort((a, b) => a.cookDate.localeCompare(b.cookDate));
}
