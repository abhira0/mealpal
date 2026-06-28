import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface PurchaseInput { productId: number; quantity: number; cents: number; }

/** Record a purchase: insert purchase row, append a price observation, restock inventory. */
export function recordPurchase(db: Db, householdId: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [purchase] = tx.insert(schema.purchases)
      .values({ householdId, productId: input.productId, quantity: input.quantity, cents: input.cents })
      .returning().all();
    tx.insert(schema.prices).values({ productId: input.productId, cents: input.cents }).run();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId,
      delta: product.packSize * input.quantity, reason: "purchase", purchaseId: purchase.id,
    }).run();
    return purchase;
  });
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
