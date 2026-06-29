import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import type { DeleteResult } from "@/lib/shops";

type Db = BetterSQLite3Database<typeof schema>;

export interface ProductInput {
  ingredientId: number;
  shopId: number;
  name: string;
  packSize: number;
  priority: number;
  priceCents?: number | null;
  url: string | null;
  imageUrl?: string | null;
  servingSize?: number | null;
}

export function createProduct(db: Db, householdId: number, input: ProductInput) {
  const [row] = db
    .insert(schema.products)
    .values({ householdId, ...input })
    .returning()
    .all();
  return row;
}

/** An ingredient's products in preference order (lowest priority number first). */
export function listProductsForIngredient(
  db: Db,
  householdId: number,
  ingredientId: number,
) {
  return db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
      ),
    )
    .orderBy(asc(schema.products.priority))
    .all();
}

/**
 * All products in the household, each with its purchase price history (newest
 * first) and an effective price = manual override (priceCents) ?? latest
 * purchase. Grouped in JS — household-scale catalog, not a hot path.
 */
export function listAllProducts(db: Db, householdId: number) {
  const products = db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      ingredientId: schema.products.ingredientId,
      shopId: schema.products.shopId,
      packSize: schema.products.packSize,
      priority: schema.products.priority,
      priceCents: schema.products.priceCents,
      available: schema.products.available,
      url: schema.products.url,
      imageUrl: schema.products.imageUrl,
      nutritionPhoto: schema.products.nutritionPhoto,
      servingSize: schema.products.servingSize,
      calories: schema.products.calories,
      fatG: schema.products.fatG,
      satFatG: schema.products.satFatG,
      transFatG: schema.products.transFatG,
      cholesterolMg: schema.products.cholesterolMg,
      sodiumMg: schema.products.sodiumMg,
      carbsG: schema.products.carbsG,
      fiberG: schema.products.fiberG,
      sugarG: schema.products.sugarG,
      proteinG: schema.products.proteinG,
    })
    .from(schema.products)
    .where(eq(schema.products.householdId, householdId))
    .orderBy(asc(schema.products.priority))
    .all();

  const purchases = db
    .select({
      productId: schema.purchases.productId,
      cents: schema.purchases.cents,
      purchasedAt: schema.purchases.purchasedAt,
    })
    .from(schema.purchases)
    // skip not-yet-priced purchases so they don't show as $0 in history/effective
    .where(and(eq(schema.purchases.householdId, householdId), isNotNull(schema.purchases.cents)))
    .orderBy(desc(schema.purchases.purchasedAt))
    .all();

  const historyByProduct = new Map<number, { cents: number; purchasedAt: Date }[]>();
  for (const p of purchases) {
    if (p.cents == null) continue; // defensive; query already filters these out
    const list = historyByProduct.get(p.productId) ?? [];
    list.push({ cents: p.cents, purchasedAt: p.purchasedAt });
    historyByProduct.set(p.productId, list);
  }

  return products.map((p) => {
    const history = historyByProduct.get(p.id) ?? [];
    const effectiveCents = p.priceCents ?? history[0]?.cents ?? null;
    return { ...p, history, effectiveCents };
  });
}

/** Lowest-preference slot for a new product: one past the current max (or 1). */
export function nextPriorityForIngredient(
  db: Db,
  householdId: number,
  ingredientId: number,
): number {
  const [row] = db
    .select({ max: sql<number | null>`max(${schema.products.priority})` })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
      ),
    )
    .all();
  return (row?.max ?? 0) + 1;
}

/**
 * Persist a drag-reorder: assign priority = 1..N in the given product order.
 * Only ids that belong to this household + ingredient are touched; any product
 * not listed keeps its old priority (so a stale/partial list can't scramble it).
 */
export function reorderProducts(
  db: Db,
  householdId: number,
  ingredientId: number,
  orderedIds: number[],
): void {
  const owned = new Set(
    listProductsForIngredient(db, householdId, ingredientId).map((p) => p.id),
  );
  db.transaction((tx) => {
    let rank = 1;
    for (const id of orderedIds) {
      if (!owned.has(id)) continue;
      tx
        .update(schema.products)
        .set({ priority: rank++ })
        .where(eq(schema.products.id, id))
        .run();
    }
  });
}

export interface ProductPatch {
  ingredientId?: number;
  shopId?: number;
  name?: string;
  packSize?: number;
  priority?: number;
  priceCents?: number | null;
  available?: boolean;
  url?: string | null;
  // public-folder path to the label photo (set by the nutrition upload route)
  nutritionPhoto?: string | null;
  // one serving in canonical units; per-serving label = per-unit value × this.
  servingSize?: number | null;
  // nutrition per canonical unit; filled from the label photo. null = unknown.
  calories?: number | null;
  fatG?: number | null;
  satFatG?: number | null;
  transFatG?: number | null;
  cholesterolMg?: number | null;
  sodiumMg?: number | null;
  carbsG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  proteinG?: number | null;
}

// Nutrient patch keys accepted on PATCH /api/products/[id] (per canonical unit).
export const NUTRIENT_PATCH_KEYS = [
  "calories", "fatG", "satFatG", "transFatG", "cholesterolMg",
  "sodiumMg", "carbsG", "fiberG", "sugarG", "proteinG",
] as const;

export function updateProduct(
  db: Db,
  householdId: number,
  id: number,
  patch: ProductPatch,
) {
  const [row] = db
    .update(schema.products)
    .set(patch)
    .where(
      and(eq(schema.products.id, id), eq(schema.products.householdId, householdId)),
    )
    .returning()
    .all();
  return row; // undefined if no row matched the household scope
}

export function deleteProduct(
  db: Db,
  householdId: number,
  id: number,
): DeleteResult {
  const purchaseCount = db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.householdId, householdId),
        eq(schema.purchases.productId, id),
      ),
    )
    .all().length;
  if (purchaseCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${purchaseCount} ${purchaseCount === 1 ? "purchase references" : "purchases reference"} this product.`,
    };
  }
  const rows = db
    .delete(schema.products)
    .where(
      and(eq(schema.products.id, id), eq(schema.products.householdId, householdId)),
    )
    .returning()
    .all();
  return { ok: true, deleted: rows.length > 0 };
}

/**
 * Effective price in cents for a product: manual override (priceCents) if set,
 * else the most recent purchase's cents, else null. History lives in purchases.
 */
export function effectivePrice(db: Db, productId: number): number | null {
  const [product] = db
    .select({ priceCents: schema.products.priceCents })
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .all();
  if (product?.priceCents != null) return product.priceCents;
  const [purchase] = db
    .select({ cents: schema.purchases.cents })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.productId, productId), isNotNull(schema.purchases.cents)))
    .orderBy(desc(schema.purchases.purchasedAt))
    .limit(1)
    .all();
  return purchase?.cents ?? null;
}
