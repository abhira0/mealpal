import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface EatInput { date: string; productId: number; variantId?: number | null; count?: number; }

/** Log eating `count` units of a product (optionally a specific variant) on a
 * date: writes a consumption row + an 'eaten' stock movement that depletes the
 * product's ingredient. */
export function logEaten(db: Db, householdId: number, input: EatInput) {
  const count = input.count && input.count > 0 ? input.count : 1;
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    const [row] = tx.insert(schema.consumptions)
      .values({ householdId, date: input.date, productId: input.productId, variantId: input.variantId ?? null, count })
      .returning().all();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId, productId: product.id,
      delta: -count, reason: "eaten",
    }).run();
    return row;
  });
}

export function listEaten(db: Db, householdId: number, date: string) {
  return db.select().from(schema.consumptions)
    .where(and(eq(schema.consumptions.householdId, householdId), eq(schema.consumptions.date, date)))
    .orderBy(asc(schema.consumptions.id))
    .all();
}
