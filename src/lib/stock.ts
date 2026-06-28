import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface MovementInput {
  ingredientId: number;
  delta: number;
  reason: "purchase" | "cooked" | "manual";
  mealEventId?: number | null;
  purchaseId?: number | null;
}

export function recordMovement(db: Db, householdId: number, m: MovementInput) {
  const [row] = db.insert(schema.stockMovements)
    .values({
      householdId, ingredientId: m.ingredientId, delta: m.delta, reason: m.reason,
      mealEventId: m.mealEventId ?? null, purchaseId: m.purchaseId ?? null,
    }).returning().all();
  return row;
}

export function currentStock(db: Db, householdId: number, ingredientId: number): number {
  const [row] = db
    .select({ total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)` })
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      eq(schema.stockMovements.ingredientId, ingredientId),
    )).all();
  return row?.total ?? 0;
}

export function stockByIngredient(db: Db, householdId: number): Map<number, number> {
  const rows = db
    .select({
      ingredientId: schema.stockMovements.ingredientId,
      total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)`,
    })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.householdId, householdId))
    .groupBy(schema.stockMovements.ingredientId).all();
  return new Map(rows.map((r) => [r.ingredientId, r.total]));
}

/** Manual correction (spills, recounts). Positive or negative. */
export function adjustStock(db: Db, householdId: number, ingredientId: number, delta: number) {
  return recordMovement(db, householdId, { ingredientId, delta, reason: "manual" });
}
