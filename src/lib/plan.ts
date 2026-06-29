import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { consumptionForRecipe, recordCooked } from "@/lib/consumption";
import { skipDay, endSeriesFrom, deleteRule } from "@/lib/rules";

type Db = BetterSQLite3Database<typeof schema>;

export type DeleteScope = "one" | "following" | "all";

export interface EventInput { date: string; slotId: number; recipeId: number; servings: number; }

export function addEvent(db: Db, householdId: number, input: EventInput) {
  const [row] = db.insert(schema.mealEvents)
    .values({ householdId, ...input, status: "planned" }).returning().all();
  return row;
}

export function listEvents(db: Db, householdId: number, from: string, to: string) {
  return db.select().from(schema.mealEvents)
    .where(and(
      eq(schema.mealEvents.householdId, householdId),
      gte(schema.mealEvents.date, from),
      lte(schema.mealEvents.date, to),
    ))
    .orderBy(asc(schema.mealEvents.date)).all();
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
    const recipe = getRecipe(db, householdId, ev.recipeId);
    if (!recipe) continue;
    for (const line of consumptionForRecipe(recipe, ev.servings)) {
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
 * Delete a planned event. For rule-generated meals, `scope` chooses the reach
 * (Google-Calendar style): just this day, this + all future, or the whole series.
 * Cooked events are kept (stock already moved).
 */
export function deleteEvent(db: Db, householdId: number, eventId: number, scope: DeleteScope = "one") {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status === "cooked") return;
  if (!ev.ruleId || scope === "one") {
    if (ev.ruleId) skipDay(db, ev.ruleId, ev.date, ev.slotId);
    else db.delete(schema.mealEvents).where(eq(schema.mealEvents.id, ev.id)).run();
  } else if (scope === "following") {
    endSeriesFrom(db, householdId, ev.ruleId, ev.date);
  } else {
    deleteRule(db, householdId, ev.ruleId);
  }
}

/** Mark an event cooked exactly once: deplete stock and flip status. */
export function cookEvent(db: Db, householdId: number, eventId: number) {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev || ev.status === "cooked") return; // no-op if missing or already cooked
  recordCooked(db, householdId, ev.recipeId, ev.servings, ev.id);
  db.update(schema.mealEvents).set({ status: "cooked" })
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
  db.update(schema.mealEvents).set({ status: "planned" })
    .where(eq(schema.mealEvents.id, ev.id)).run();
}
