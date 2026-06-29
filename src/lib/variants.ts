import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

type Db = BetterSQLite3Database<typeof schema>;

export type VariantNutrients = Partial<Record<(typeof NUTRIENT_PATCH_KEYS)[number], number | null>>;
export interface VariantInput extends VariantNutrients { name: string; nutritionPhoto?: string | null; servingSize?: number | null; }
export type VariantPatch = Partial<VariantInput>;

/** Create a variant under a product. Returns undefined if the product isn't in
 *  the household (so we never orphan a variant onto a foreign product). */
export function createVariant(db: Db, householdId: number, productId: number, input: VariantInput) {
  const [product] = db.select({ id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.householdId, householdId))).all();
  if (!product) return undefined;
  const [row] = db.insert(schema.productVariants)
    .values({ householdId, productId, ...input })
    .returning().all();
  return row;
}

export function listVariants(db: Db, householdId: number, productId: number) {
  return db.select().from(schema.productVariants)
    .where(and(
      eq(schema.productVariants.householdId, householdId),
      eq(schema.productVariants.productId, productId),
    ))
    .orderBy(asc(schema.productVariants.id))
    .all();
}

export function updateVariant(db: Db, householdId: number, id: number, patch: VariantPatch) {
  const [row] = db.update(schema.productVariants)
    .set(patch)
    .where(and(eq(schema.productVariants.id, id), eq(schema.productVariants.householdId, householdId)))
    .returning().all();
  return row; // undefined if out of household scope
}

export function deleteVariant(db: Db, householdId: number, id: number): boolean {
  // consumptions referencing this variant keep their row but lose the link
  db.update(schema.consumptions).set({ variantId: null })
    .where(and(eq(schema.consumptions.householdId, householdId), eq(schema.consumptions.variantId, id))).run();
  return db.delete(schema.productVariants)
    .where(and(eq(schema.productVariants.id, id), eq(schema.productVariants.householdId, householdId)))
    .returning().all().length > 0;
}
