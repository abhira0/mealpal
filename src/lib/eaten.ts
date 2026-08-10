import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { allocateFEFO } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

// `count` is the number of servings/packets eaten (default 1). One packet is
// the chosen variant's servingSize in canonical units (e.g. 43 g); when there's
// no variant or no serving size, one packet = one canonical unit (count packs).
export interface EatInput { date: string; productId: number; variantId?: number | null; count?: number; }

/** Log eating a product (optionally a specific variant) on a date: stores the
 * consumption in CANONICAL UNITS (servings × the variant's packet size) and an
 * 'eaten' stock movement that depletes the product's ingredient by the same. */
export function logEaten(db: Db, householdId: number, input: EatInput) {
  const servings = input.count && input.count > 0 ? input.count : 1;
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    let perServing = 1; // canonical units in one packet/serving
    if (input.variantId != null) {
      const [variant] = tx.select({ s: schema.productVariants.servingSize }).from(schema.productVariants)
        .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.householdId, householdId))).all();
      if (variant?.s && variant.s > 0) perServing = variant.s;
    }
    const canonical = servings * perServing;
    const [row] = tx.insert(schema.consumptions)
      .values({ householdId, date: input.date, productId: input.productId, variantId: input.variantId ?? null, count: canonical })
      .returning().all();
    // Draw from lots FEFO (soonest-expiry first) like cooking does, so the
    // depletion is attributed to real purchases — otherwise it lands in the
    // unattributed pool, which stockByIngredient floors at 0.
    allocateFEFO(tx, householdId, product.ingredientId, product.id, canonical, {
      reason: "eaten", variantId: input.variantId ?? null,
    });
    return row;
  });
}

export function listEaten(db: Db, householdId: number, date: string) {
  return db.select().from(schema.consumptions)
    .where(and(eq(schema.consumptions.householdId, householdId), eq(schema.consumptions.date, date)))
    .orderBy(asc(schema.consumptions.id))
    .all();
}
