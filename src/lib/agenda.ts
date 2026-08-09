import { and, eq, gte, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { listBatches } from "@/lib/batches";
import { localNoon, toISODate } from "@/lib/dates";

type Db = BetterSQLite3Database<typeof schema>;

export interface AgendaMeal {
  eventId: number;
  slotId: number;
  slotName: string;
  name: string; // resolved meal name
  status: "planned" | "cooked";
  batchBacked: boolean; // an active batch exists for this slot
  batchId: number | null; // that batch's id, or null
  mealsRemaining: number | null; // that batch's remaining, or null
  eatenFromBatchToday: boolean; // a batch_eaten row exists for (batchId, this date)
}

export interface CookFlag {
  slotId: number;
  slotName: string;
  label: string;
}

export interface AgendaDay {
  date: string;
  meals: AgendaMeal[]; // ordered by slot timeOfDay
  cookFlags: CookFlag[]; // slots whose active batch runs out ON this date
  eatenCount: number; // meals considered done this day
  totalCount: number; // meals.length
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
      return variant?.name ?? p?.name ?? "Item";
    }
    if (ev.ingredientId != null) {
      return ingredientById.get(ev.ingredientId)?.name ?? "Item";
    }
    return "Item";
  }

  // day -> cook flags landing on it, computed from each active batch's projected empty date
  const cookFlagsByDate = new Map<string, CookFlag[]>();
  for (const b of activeBatches) {
    const cookDate = addDays(today, b.mealsRemaining);
    if (cookDate < from || cookDate > to) continue;
    const slot = slotById.get(b.slotId);
    const flag: CookFlag = { slotId: b.slotId, slotName: slot?.name ?? "—", label: b.label };
    const bucket = cookFlagsByDate.get(cookDate);
    if (bucket) bucket.push(flag);
    else cookFlagsByDate.set(cookDate, [flag]);
  }

  return dateRange(from, to).map((date) => {
    const dayEvents = eventsByDate.get(date) ?? [];
    const meals: AgendaMeal[] = dayEvents
      .map((ev) => {
        const slot = slotById.get(ev.slotId);
        const batch = batchBySlot.get(ev.slotId) ?? null;
        const batchBacked = batch != null;
        const eatenFromBatchToday = batchBacked && eatenKeys.has(`${batch!.id}:${date}`);
        return {
          eventId: ev.id,
          slotId: ev.slotId,
          slotName: slot?.name ?? "—",
          name: resolveName(ev),
          status: ev.status as "planned" | "cooked",
          batchBacked,
          batchId: batch ? batch.id : null,
          mealsRemaining: batch ? batch.mealsRemaining : null,
          eatenFromBatchToday,
          _timeOfDay: slot?.timeOfDay ?? "12:00",
        };
      })
      .sort((a, b) => a._timeOfDay.localeCompare(b._timeOfDay))
      .map(({ _timeOfDay, ...m }) => m);

    const eatenCount = meals.filter((m) => m.status === "cooked" || (m.batchBacked && m.eatenFromBatchToday)).length;

    return {
      date,
      meals,
      cookFlags: cookFlagsByDate.get(date) ?? [],
      eatenCount,
      totalCount: meals.length,
    };
  });
}
