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
 * Soonest expiry per product — only among lots that still have stock on hand.
 * A fully-consumed old lot no longer counts (that was the bug: its stale date
 * kept surfacing). productId -> earliest YYYY-MM-DD.
 */
export function expiryByProduct(db: Db, householdId: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const [productId, lots] of lotsByProduct(db, householdId)) {
    for (const l of lots) {
      if (l.remaining <= 0 || !l.expiresAt) continue;
      const prev = out.get(productId);
      if (!prev || l.expiresAt < prev) out.set(productId, l.expiresAt); // YYYY-MM-DD sorts lexically
    }
  }
  return out;
}

/** A lot = one `purchases` row (a real buy, or a manual on-hand backfill). */
export interface Lot {
  purchaseId: number;
  expiresAt: string | null;
  remaining: number;
  pricePaidCents: number | null;
  manual: boolean;
}

/**
 * Lots per product, FEFO-ordered (soonest expiry first, undated last; ties/
 * undated broken by oldest purchasedAt). remaining = Σ that lot's movements'
 * delta; zero-remaining lots are dropped, negative ones kept (a recount signal).
 * Invariant: Σ lot.remaining per product == stockByProduct for that product.
 */
export function lotsByProduct(db: Db, householdId: number): Map<number, Lot[]> {
  const purchaseRows = db.select({
    purchaseId: schema.purchases.id,
    productId: schema.purchases.productId,
    expiresAt: schema.purchases.expiresAt,
    purchasedAt: schema.purchases.purchasedAt,
    pricePaidCents: schema.purchases.cents,
    manual: schema.purchases.manual,
  }).from(schema.purchases).where(eq(schema.purchases.householdId, householdId)).all();

  const remainingRows = db.select({
    purchaseId: schema.stockMovements.purchaseId,
    total: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)`,
  }).from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      sql`${schema.stockMovements.purchaseId} is not null`,
    ))
    .groupBy(schema.stockMovements.purchaseId).all();
  const remainingByLot = new Map(remainingRows.map((r) => [r.purchaseId as number, r.total]));

  const out = new Map<number, (Lot & { purchasedAt: Date })[]>();
  for (const p of purchaseRows) {
    const remaining = remainingByLot.get(p.purchaseId) ?? 0;
    if (remaining === 0) continue;
    const arr = out.get(p.productId) ?? [];
    arr.push({
      purchaseId: p.purchaseId, expiresAt: p.expiresAt, remaining,
      pricePaidCents: p.pricePaidCents, manual: p.manual, purchasedAt: p.purchasedAt,
    });
    out.set(p.productId, arr);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => {
      const ae = a.expiresAt ?? "￿"; // undated sorts last
      const be = b.expiresAt ?? "￿";
      if (ae !== be) return ae < be ? -1 : 1;
      return +a.purchasedAt - +b.purchasedAt;
    });
  }
  return out as Map<number, Lot[]>;
}

export interface FEFOContext {
  reason: "cooked" | "eaten" | "manual";
  variantId?: number | null;
  mealEventId?: number | null;
}

/**
 * Deplete `amount` (positive, canonical units) of a product, soonest-expiry
 * lot first, writing one negative movement per lot it draws from. Overflow
 * beyond total on-hand lands on the soonest-expiry lot (goes negative); a
 * product with no lots at all gets one unattributed negative (legacy
 * fallback). `tx` may be a plain db or a caller's transaction (e.g. packBatch).
 * Returns the movements written.
 */
export function allocateFEFO(
  tx: Db, householdId: number, ingredientId: number, productId: number,
  amount: number, ctx: FEFOContext,
) {
  const lots = lotsByProduct(tx, householdId).get(productId) ?? [];
  const written: ReturnType<typeof recordMovement>[] = [];
  const write = (delta: number, purchaseId?: number | null) =>
    written.push(recordMovement(tx, householdId, {
      ingredientId, productId, delta, reason: ctx.reason,
      variantId: ctx.variantId, mealEventId: ctx.mealEventId, purchaseId,
    }));

  if (lots.length === 0) {
    write(-amount);
    return written;
  }

  let left = amount;
  for (const lot of lots) {
    if (left <= 0) break;
    if (lot.remaining <= 0) continue;
    const take = Math.min(left, lot.remaining);
    write(-take, lot.purchaseId);
    left -= take;
  }
  if (left > 0) write(-left, lots[0].purchaseId); // overflow: soonest lot goes negative
  return written;
}

/**
 * Manual correction (spills, recounts) or backfill. Positive or negative.
 * Negative depletes soonest-first via allocateFEFO. Positive creates a new
 * `manual` lot (dated or undated) and its inbound movement.
 */
export function adjustStock(
  db: Db, householdId: number, ingredientId: number, delta: number,
  expiresAt?: string | null, productId?: number | null,
) {
  if (delta < 0 && productId != null) {
    return allocateFEFO(db, householdId, ingredientId, productId, -delta, { reason: "manual" });
  }
  if (delta > 0 && productId != null) {
    return db.transaction((tx) => {
      const [purchase] = tx.insert(schema.purchases)
        .values({ householdId, productId, quantity: 1, cents: null, expiresAt: expiresAt ?? null, manual: true })
        .returning().all();
      return [recordMovement(tx, householdId, {
        ingredientId, productId, delta, reason: "manual", expiresAt, purchaseId: purchase.id,
      })];
    });
  }
  // no product (unattributed pool) — plain ledger entry, no lot to attribute to
  return [recordMovement(db, householdId, { ingredientId, productId, delta, reason: "manual", expiresAt })];
}

/**
 * Soonest expiry per ingredient — only among lots that still have stock on hand
 * (via product → ingredient). Fully-consumed lots don't count. Earliest wins.
 */
export function expiryByIngredient(db: Db, householdId: number): Map<number, string> {
  const prodIngredient = new Map<number, number>();
  for (const p of db.select({ id: schema.products.id, ingredientId: schema.products.ingredientId })
    .from(schema.products).where(eq(schema.products.householdId, householdId)).all())
    prodIngredient.set(p.id, p.ingredientId);

  const out = new Map<number, string>();
  const consider = (ingredientId: number, date: string | null | undefined) => {
    if (!date) return;
    const prev = out.get(ingredientId);
    if (!prev || date < prev) out.set(ingredientId, date); // YYYY-MM-DD sorts lexically
  };

  // Attributed stock: only lots that still have units on hand.
  for (const [productId, lots] of lotsByProduct(db, householdId)) {
    const ingredientId = prodIngredient.get(productId);
    if (ingredientId == null) continue;
    for (const l of lots) if (l.remaining > 0) consider(ingredientId, l.expiresAt);
  }

  // Unattributed pool (legacy untagged stock, no lot): its soonest date, but only
  // while the pool is still net-positive. ponytail: no per-batch tracking here, so
  // a consumed dated sub-batch can linger — acceptable for the untracked pool.
  const unattributed = db.select({
    ingredientId: schema.stockMovements.ingredientId,
    net: sql<number>`coalesce(sum(${schema.stockMovements.delta}), 0)`,
    soonest: sql<string | null>`min(case when ${schema.stockMovements.expiresAt} is not null then ${schema.stockMovements.expiresAt} end)`,
  }).from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.householdId, householdId),
      isNull(schema.stockMovements.purchaseId),
    ))
    .groupBy(schema.stockMovements.ingredientId).all();
  for (const r of unattributed) if (r.net > 0) consider(r.ingredientId, r.soonest);

  return out;
}
