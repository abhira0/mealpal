import { and, eq, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface MovementInput {
  ingredientId: number;
  productId?: number | null;
  variantId?: number | null;
  delta: number;
  reason: "purchase" | "cooked" | "manual" | "eaten";
  mealEventId?: number | null;
  purchaseId?: number | null;
  expiresAt?: string | null;
}

export function recordMovement(db: Db, householdId: number, m: MovementInput) {
  const [row] = db.insert(schema.stockMovements)
    .values({
      householdId, ingredientId: m.ingredientId, productId: m.productId ?? null,
      variantId: m.variantId ?? null,
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

/**
 * Soonest non-null expiry per product, from manual backfill (stock_movements)
 * and purchases. productId -> earliest YYYY-MM-DD. Mirrors expiryByIngredient.
 */
export function expiryByProduct(db: Db, householdId: number): Map<number, string> {
  const manual = db
    .select({
      productId: schema.stockMovements.productId,
      soonest: sql<string>`min(${schema.stockMovements.expiresAt})`,
    })
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      sql`${schema.stockMovements.productId} is not null`,
      sql`${schema.stockMovements.expiresAt} is not null`,
    ))
    .groupBy(schema.stockMovements.productId).all();

  const bought = db
    .select({
      productId: schema.purchases.productId,
      soonest: sql<string>`min(${schema.purchases.expiresAt})`,
    })
    .from(schema.purchases)
    .where(and(
      eq(schema.purchases.householdId, householdId),
      sql`${schema.purchases.expiresAt} is not null`,
    ))
    .groupBy(schema.purchases.productId).all();

  const out = new Map<number, string>();
  for (const r of [...manual, ...bought]) {
    if (r.productId == null || !r.soonest) continue;
    const prev = out.get(r.productId);
    if (!prev || r.soonest < prev) out.set(r.productId, r.soonest); // YYYY-MM-DD sorts lexically
  }
  return out;
}

/**
 * Set the manual (on-hand) expiry for a product — or an ingredient's unattributed
 * pool when productId is null — REPLACING any prior manual date in place instead
 * of appending a new dated movement (the old append-only behaviour made min()
 * keep returning the earliest stale date, so edits never showed). The date is
 * pinned to the target's largest existing manual movement (the real on-hand
 * batch); if there's none, a single zero-delta carrier is recorded. Every other
 * manual date for the same target is retired so exactly one survives — bare
 * zero-delta carriers are deleted, real movements just lose the stale date.
 * Purchases keep their own dates; the pantry still shows min() across all of them.
 */
export function replaceManualExpiry(
  db: Db, householdId: number, ingredientId: number,
  productId: number | null, expiresAt: string | null,
) {
  // Several retire/update/insert writes must land together, or a crash mid-way
  // leaves the target with zero or two "current" manual dates.
  db.transaction((tx) => {
    const scope = and(
      eq(schema.stockMovements.householdId, householdId),
      eq(schema.stockMovements.ingredientId, ingredientId),
      eq(schema.stockMovements.reason, "manual"),
      productId == null
        ? isNull(schema.stockMovements.productId)
        : eq(schema.stockMovements.productId, productId),
    );
    const manual = tx.select().from(schema.stockMovements).where(scope).all();

    // Retire a movement's stale date: drop bare carriers, keep real stock but clear its date.
    const retire = (m: (typeof manual)[number]) => {
      if (m.expiresAt == null) return;
      if (m.delta === 0) tx.delete(schema.stockMovements).where(eq(schema.stockMovements.id, m.id)).run();
      else tx.update(schema.stockMovements).set({ expiresAt: null }).where(eq(schema.stockMovements.id, m.id)).run();
    };

    if (expiresAt == null) {
      for (const m of manual) retire(m);
      return;
    }

    // Carrier = the real on-hand batch (largest |delta|), else any manual row.
    const carrier = manual.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (!carrier) {
      tx.insert(schema.stockMovements)
        .values({ householdId, ingredientId, productId: productId ?? null, delta: 0, reason: "manual", expiresAt })
        .run();
      return;
    }
    tx.update(schema.stockMovements).set({ expiresAt }).where(eq(schema.stockMovements.id, carrier.id)).run();
    for (const m of manual) if (m.id !== carrier.id) retire(m);
  });
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
