import { and, asc, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface ProductInput {
  ingredientId: number;
  shopId: number;
  branchId: number | null;
  name: string;
  packSize: number;
  priority: number;
  url: string | null;
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

export function addPrice(db: Db, productId: number, cents: number, observedAt?: Date) {
  const [row] = db
    .insert(schema.prices)
    .values({ productId, cents, ...(observedAt ? { observedAt } : {}) })
    .returning()
    .all();
  return row;
}

export function latestPrice(db: Db, productId: number) {
  const [row] = db
    .select()
    .from(schema.prices)
    .where(eq(schema.prices.productId, productId))
    .orderBy(desc(schema.prices.observedAt))
    .limit(1)
    .all();
  return row;
}
