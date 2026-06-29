import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface MovementInput {
  ingredientId: number;
  productId?: number | null;
  delta: number;
  reason: "purchase" | "cooked" | "manual";
  mealEventId?: number | null;
  purchaseId?: number | null;
  expiresAt?: string | null;
}

export function recordMovement(db: Db, householdId: number, m: MovementInput) {
  const [row] = db.insert(schema.stockMovements)
    .values({
      householdId, ingredientId: m.ingredientId, productId: m.productId ?? null,
      delta: m.delta, reason: m.reason,
      mealEventId: m.mealEventId ?? null, purchaseId: m.purchaseId ?? null,
      expiresAt: m.expiresAt ?? null,
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

/** On-hand per product (skips unattributed/null-product movements). productId -> qty. */
export function stockByProduct(db: Db, householdId: number): Map<number, number> {
  const rows = db
    .select({
      productId: schema.stockMovements.productId,
      total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)`,
    })
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      sql`${schema.stockMovements.productId} is not null`,
    ))
    .groupBy(schema.stockMovements.productId).all();
  return new Map(rows.map((r) => [r.productId as number, r.total]));
}

/** Manual correction (spills, recounts) or backfill. Positive or negative. */
export function adjustStock(
  db: Db, householdId: number, ingredientId: number, delta: number,
  expiresAt?: string | null, productId?: number | null,
) {
  return recordMovement(db, householdId, { ingredientId, productId, delta, reason: "manual", expiresAt });
}

/**
 * Soonest non-null expiry per ingredient, from both sources: manual backfill
 * (stock_movements.expires_at) and purchases (purchases.expires_at via
 * product → ingredient). Earliest date wins. Only the backfill input ever sets
 * a date, so no delta filter is needed.
 */
export function expiryByIngredient(db: Db, householdId: number): Map<number, string> {
  const manual = db
    .select({
      ingredientId: schema.stockMovements.ingredientId,
      soonest: sql<string>`min(${schema.stockMovements.expiresAt})`,
    })
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      sql`${schema.stockMovements.expiresAt} is not null`,
    ))
    .groupBy(schema.stockMovements.ingredientId).all();

  const bought = db
    .select({
      ingredientId: schema.products.ingredientId,
      soonest: sql<string>`min(${schema.purchases.expiresAt})`,
    })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    .where(and(
      eq(schema.purchases.householdId, householdId),
      sql`${schema.purchases.expiresAt} is not null`,
    ))
    .groupBy(schema.products.ingredientId).all();

  const out = new Map<number, string>();
  for (const r of [...manual, ...bought]) {
    if (!r.soonest) continue;
    const prev = out.get(r.ingredientId);
    if (!prev || r.soonest < prev) out.set(r.ingredientId, r.soonest); // YYYY-MM-DD sorts lexically
  }
  return out;
}
