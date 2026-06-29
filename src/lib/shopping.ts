import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

// cents null = bought but not yet priced; fill it in later on the bill screen.
export interface PurchaseInput { productId: number; quantity: number; cents?: number | null; expiresAt?: string | null; }

/** Record a purchase: insert purchase row and restock inventory. The purchase IS the price history. */
export function recordPurchase(db: Db, householdId: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [purchase] = tx.insert(schema.purchases)
      .values({ householdId, productId: input.productId, quantity: input.quantity, cents: input.cents ?? null, expiresAt: input.expiresAt ?? null })
      .returning().all();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId,
      delta: product.packSize * input.quantity, reason: "purchase", purchaseId: purchase.id,
    }).run();
    return purchase;
  });
}

/** Pending purchases (no price yet), newest first, with product name + a price hint. */
export function listPendingPurchases(db: Db, householdId: number) {
  return db.select({
    id: schema.purchases.id,
    productId: schema.purchases.productId,
    productName: schema.products.name,
    quantity: schema.purchases.quantity,
    expiresAt: schema.purchases.expiresAt,
    hintCents: schema.products.priceCents, // manual override as a suggestion; may be null
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    .where(and(eq(schema.purchases.householdId, householdId), isNull(schema.purchases.cents)))
    .orderBy(desc(schema.purchases.purchasedAt))
    .all();
}

/**
 * Fill in / correct a purchase. Changing quantity re-syncs the linked restock
 * movement's delta so inventory stays consistent. Household-scoped.
 */
export function updatePurchase(
  db: Db, householdId: number, id: number,
  patch: { cents?: number | null; expiresAt?: string | null; quantity?: number },
) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return undefined;

    if (patch.quantity !== undefined && patch.quantity !== purchase.quantity) {
      const [product] = tx.select().from(schema.products)
        .where(eq(schema.products.id, purchase.productId)).all();
      if (product) {
        tx.update(schema.stockMovements)
          .set({ delta: product.packSize * patch.quantity })
          .where(eq(schema.stockMovements.purchaseId, id)).run();
      }
    }

    const [row] = tx.update(schema.purchases)
      .set({
        ...(patch.cents !== undefined ? { cents: patch.cents } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      })
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId)))
      .returning().all();
    return row;
  });
}

/**
 * Per-ingredient shelf life in days, learned from purchase history:
 * median(expiresAt − purchasedAt) over that ingredient's dated purchases.
 * Only ingredients with ≥2 dated purchases are included; callers fall back to
 * the horizon for the rest. Pooled across all products of the ingredient.
 */
export function learnedShelfLife(db: Db, householdId: number): Map<number, number> {
  const rows = db.select({
    ingredientId: schema.products.ingredientId,
    expiresAt: schema.purchases.expiresAt,
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    .where(eq(schema.purchases.householdId, householdId))
    .all();

  const daysByIngredient = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.expiresAt) continue;
    const days = Math.round((Date.parse(r.expiresAt) - r.purchasedAt.getTime()) / 86_400_000);
    if (days <= 0) continue; // ignore already-expired / same-day junk
    const list = daysByIngredient.get(r.ingredientId) ?? [];
    list.push(days);
    daysByIngredient.set(r.ingredientId, list);
  }

  const result = new Map<number, number>();
  for (const [ingredientId, days] of daysByIngredient) {
    if (days.length < 2) continue; // not enough data to trust
    days.sort((a, b) => a - b);
    const mid = Math.floor(days.length / 2);
    const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
    result.set(ingredientId, median);
  }
  return result;
}

export interface ShoppingLine {
  ingredientId: number; ingredientName: string;
  needed: number;        // canonical units short
  product: { id: number; name: string } | null; // top-priority available product
}

/**
 * For each ingredient short of `targetByIngredient`, pick the top-priority AVAILABLE
 * product and group the resulting lines by shop. Returns a shop -> lines map.
 */
export function buyRecommendation(
  db: Db, householdId: number,
  stockByIngredientMap: Map<number, number>,
  targetByIngredient: Map<number, number>,
): Map<string, ShoppingLine[]> {
  const result = new Map<string, ShoppingLine[]>();
  const ingredientRows = db.select().from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId)).all();
  const nameById = new Map(ingredientRows.map((i) => [i.id, i.name]));

  for (const [ingredientId, target] of targetByIngredient) {
    const have = stockByIngredientMap.get(ingredientId) ?? 0;
    const needed = target - have;
    if (needed <= 0) continue;
    const [product] = db.select().from(schema.products)
      .where(and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
        eq(schema.products.available, true),
      ))
      .orderBy(asc(schema.products.priority)).limit(1).all();
    const shop = product
      ? db.select().from(schema.shops).where(eq(schema.shops.id, product.shopId)).all()[0]
      : null;
    const shopKey = shop?.name ?? "Unassigned";
    const line: ShoppingLine = {
      ingredientId, ingredientName: nameById.get(ingredientId) ?? "?",
      needed, product: product ? { id: product.id, name: product.name } : null,
    };
    if (!result.has(shopKey)) result.set(shopKey, []);
    result.get(shopKey)!.push(line);
  }
  return result;
}
