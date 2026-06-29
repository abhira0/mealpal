import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

// cents null = bought but not yet priced; fill it in later on the bill screen.
export interface PurchaseInput { productId: number; quantity: number; cents?: number | null; expiresAt?: string | null; }

/** Are there variant products pointing at this product as their pack parent? */
function hasVariants(tx: Db, householdId: number, productId: number): boolean {
  return tx.select({ id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.householdId, householdId), eq(schema.products.packParentId, productId)))
    .all().length > 0;
}

/** Record a purchase: insert purchase row and restock inventory. The purchase IS the price history. */
export function recordPurchase(db: Db, householdId: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [purchase] = tx.insert(schema.purchases)
      .values({ householdId, productId: input.productId, quantity: input.quantity, cents: input.cents ?? null, expiresAt: input.expiresAt ?? null })
      .returning().all();
    // A pack (assorted bag) restocks nothing yet — the per-variant packet counts
    // aren't known until you check the bag, so they're entered at bill time via
    // setPackCounts. A normal product restocks packSize × quantity right away.
    if (!hasVariants(tx, householdId, product.id)) {
      tx.insert(schema.stockMovements).values({
        householdId, ingredientId: product.ingredientId, productId: product.id,
        delta: product.packSize * input.quantity, reason: "purchase", purchaseId: purchase.id,
      }).run();
    }
    return purchase;
  });
}

/**
 * Lock in how many packets of each variant were in an assorted-pack purchase.
 * Replaces the purchase's restock movements (idempotent — safe to re-save from
 * the bill screen or correct later): one movement per variant, packSize×packets,
 * tied to the purchase so undo/expiry stay consistent. Counts of 0 add nothing.
 */
export function setPackCounts(
  db: Db, householdId: number, purchaseId: number,
  counts: { productId: number; packets: number }[], expiresAt?: string | null,
) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, purchaseId), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return undefined;
    tx.delete(schema.stockMovements).where(eq(schema.stockMovements.purchaseId, purchaseId)).run();
    for (const c of counts) {
      if (!c.packets || c.packets <= 0) continue;
      const [variant] = tx.select().from(schema.products)
        .where(and(
          eq(schema.products.id, c.productId),
          eq(schema.products.householdId, householdId),
          eq(schema.products.packParentId, purchase.productId), // must be a real variant of this pack
        )).all();
      if (!variant) continue;
      tx.insert(schema.stockMovements).values({
        householdId, ingredientId: variant.ingredientId, productId: variant.id,
        delta: variant.packSize * c.packets, reason: "purchase", purchaseId,
        expiresAt: expiresAt ?? purchase.expiresAt ?? null,
      }).run();
    }
    return purchase;
  });
}

/** Pending purchases (no price yet), newest first, with product name + a price hint. */
export function listPendingPurchases(db: Db, householdId: number) {
  return db.select({
    id: schema.purchases.id,
    productId: schema.purchases.productId,
    ingredientId: schema.products.ingredientId,
    productName: schema.products.name,
    shopName: schema.shops.name,
    website: schema.shops.website,
    iconUrl: schema.shops.iconUrl,
    quantity: schema.purchases.quantity,
    expiresAt: schema.purchases.expiresAt,
    hintCents: schema.products.priceCents, // manual override as a suggestion; may be null
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    .innerJoin(schema.shops, eq(schema.shops.id, schema.products.shopId))
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
  patch: { cents?: number | null; expiresAt?: string | null; quantity?: number; productId?: number },
) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return undefined;

    // Swapping the product (e.g. the milk you wanted was out, you grabbed another)
    // or changing quantity re-points/re-sizes the linked restock so stock stays right.
    const newProductId = patch.productId ?? purchase.productId;
    const quantity = patch.quantity ?? purchase.quantity;
    // Packs carry no single restock movement (variant packets are set via
    // setPackCounts), so skip the packSize re-sync for them.
    if ((patch.productId !== undefined || (patch.quantity !== undefined && patch.quantity !== purchase.quantity))
        && !hasVariants(tx, householdId, newProductId)) {
      const [product] = tx.select().from(schema.products)
        .where(and(eq(schema.products.id, newProductId), eq(schema.products.householdId, householdId))).all();
      if (!product) throw new Error("product not found in household");
      tx.update(schema.stockMovements)
        .set({ productId: product.id, ingredientId: product.ingredientId, delta: product.packSize * quantity })
        .where(eq(schema.stockMovements.purchaseId, id)).run();
    }

    const [row] = tx.update(schema.purchases)
      .set({
        ...(patch.cents !== undefined ? { cents: patch.cents } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
      })
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId)))
      .returning().all();
    return row;
  });
}

/** Undo a purchase: drop its restock movement and the purchase row. Household-scoped. */
export function deletePurchase(db: Db, householdId: number, id: number) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return false;
    tx.delete(schema.stockMovements).where(eq(schema.stockMovements.purchaseId, id)).run();
    tx.delete(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).run();
    return true;
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

/** Add a manual line: a tracked product OR a one-off free-text title. */
export function addExtra(
  db: Db, householdId: number,
  input: { productId?: number | null; title?: string | null; shopId?: number | null; quantity?: number },
) {
  const [row] = db.insert(schema.shoppingExtras)
    .values({
      householdId,
      productId: input.productId ?? null,
      title: input.title?.trim() || null,
      shopId: input.shopId ?? null,
      quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    })
    .returning().all();
  return row;
}

/** Manual lines for the run, with the shop they belong to (product's shop, else explicit, else null). */
export function listExtras(db: Db, householdId: number) {
  return db.select({
    id: schema.shoppingExtras.id,
    title: schema.shoppingExtras.title,
    quantity: schema.shoppingExtras.quantity,
    productId: schema.products.id,
    productName: schema.products.name,
    // product's shop wins; otherwise the explicitly chosen shop
    shopName: schema.shops.name,
  })
    .from(schema.shoppingExtras)
    .leftJoin(schema.products, eq(schema.products.id, schema.shoppingExtras.productId))
    .leftJoin(
      schema.shops,
      eq(schema.shops.id, sql`coalesce(${schema.products.shopId}, ${schema.shoppingExtras.shopId})`),
    )
    .where(eq(schema.shoppingExtras.householdId, householdId))
    .all();
}

export function deleteExtra(db: Db, householdId: number, id: number) {
  const res = db.delete(schema.shoppingExtras)
    .where(and(eq(schema.shoppingExtras.id, id), eq(schema.shoppingExtras.householdId, householdId)))
    .run();
  return res.changes > 0;
}

export interface ShoppingLine {
  ingredientId: number; ingredientName: string;
  needed: number;        // canonical units short
  product: { id: number; name: string; packSize: number } | null; // top-priority available product
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
      needed, product: product ? { id: product.id, name: product.name, packSize: product.packSize } : null,
    };
    if (!result.has(shopKey)) result.set(shopKey, []);
    result.get(shopKey)!.push(line);
  }
  return result;
}
