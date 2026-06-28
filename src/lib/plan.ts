import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { consumptionForRecipe, recordCooked } from "@/lib/consumption";

type Db = BetterSQLite3Database<typeof schema>;

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

/** Sum of planned (not yet cooked) consumption per ingredient over [from, to]. */
export function plannedConsumption(db: Db, householdId: number, from: string, to: string): Map<number, number> {
  const events = listEvents(db, householdId, from, to).filter((e) => e.status === "planned");
  const map = new Map<number, number>();
  for (const ev of events) {
    const recipe = getRecipe(db, householdId, ev.recipeId);
    if (!recipe) continue;
    for (const line of consumptionForRecipe(recipe, ev.servings)) {
      map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount);
    }
  }
  return map;
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
