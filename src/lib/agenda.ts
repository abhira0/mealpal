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
  daysAway: number;
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

  // newest active batch per slot
  const activeBatches = listBatches(db, householdId); // newest cookedDate first
  const batchBySlot = new Map<number, (typeof activeBatches)[number]>();
  for (const b of activeBatches) {
    if (!batchBySlot.has(b.slotId)) batchBySlot.set(b.slotId, b);
  }

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
  // window ends (cookedDate + mealsTotal), i.e. right after its last covered day.
  const cookFlagsByDate = new Map<string, CookFlag[]>();
  for (const b of activeBatches) {
    const cookDate = addDays(b.cookedDate, b.mealsTotal);
    if (cookDate < from || cookDate > to) continue;
    const slot = slotById.get(b.slotId);
    const flag: CookFlag = { slotId: b.slotId, slotName: slot?.name ?? "—", label: b.label };
    const bucket = cookFlagsByDate.get(cookDate);
    if (bucket) bucket.push(flag);
    else cookFlagsByDate.set(cookDate, [flag]);
  }

  // day -> synthetic batch meal rows: for each active batch's coverage window
  // (cookedDate .. cookedDate + mealsTotal - 1), project a meal row onto every
  // covered day that has no real meal_event for that batch's slot already.
  const syntheticByDate = new Map<string, (AgendaMeal & { _timeOfDay: string })[]>();
  for (const b of activeBatches) {
    const slot = slotById.get(b.slotId);
    const coverageEnd = addDays(b.cookedDate, b.mealsTotal - 1);
    for (const d of dateRange(b.cookedDate, coverageEnd)) {
      if (d < from || d > to) continue;
      const dayEvents = eventsByDate.get(d) ?? [];
      if (dayEvents.some((ev) => ev.slotId === b.slotId)) continue; // real event wins, no duplicate
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
        const batch = batchBySlot.get(ev.slotId) ?? null;
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
 * Next meal-prep date per slot: for each active batch, its cook date is
 * cookedDate + mealsTotal days (the day its coverage window runs out, same
 * math as agendaDays' cook flags). A slot with multiple active batches keeps
 * only the one that runs out soonest. Sorted by cookDate ascending.
 */
export function nextCooks(db: Db, householdId: number, today: string): NextCook[] {
  const slots = db.select().from(schema.mealSlots)
    .where(eq(schema.mealSlots.householdId, householdId)).all();
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const activeBatches = listBatches(db, householdId);
  const bySlot = new Map<number, { cookDate: string; label: string }>();
  for (const b of activeBatches) {
    const cookDate = addDays(b.cookedDate, b.mealsTotal);
    const existing = bySlot.get(b.slotId);
    if (!existing || cookDate < existing.cookDate) {
      bySlot.set(b.slotId, { cookDate, label: b.label });
    }
  }

  const todayMs = localNoon(today).getTime();
  const daysFrom = (date: string) =>
    Math.max(0, Math.round((localNoon(date).getTime() - todayMs) / 86_400_000));

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
    result.push({
      slotId,
      slotName: slot?.name ?? "—",
      label: getRecipe(db, householdId, recipeId)?.name ?? "Recipe",
      cookDate: date,
      daysAway: daysFrom(date),
    });
  }

  return result.sort((a, b) => a.cookDate.localeCompare(b.cookDate));
}
