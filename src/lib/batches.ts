import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { recordCooked } from "@/lib/consumption";
import { recordMovement } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface BatchItemInput {
  recipeId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  ingredientId?: number | null;
  amount?: number | null; // servings for a recipe item; canonical units for a product
}
export interface PackBatchInput {
  slotId: number;
  label: string;
  cookedDate: string; // YYYY-MM-DD
  mealsTotal: number;
  items: BatchItemInput[];
}

/** Create a batch and deplete stock once for `mealsTotal` servings of its items. */
export function packBatch(db: Db, householdId: number, input: PackBatchInput) {
  return db.transaction((tx) => {
    const [batch] = tx.insert(schema.batches).values({
      householdId, slotId: input.slotId, label: input.label,
      cookedDate: input.cookedDate, mealsTotal: input.mealsTotal, mealsRemaining: input.mealsTotal,
    }).returning().all();

    for (const item of input.items) {
      tx.insert(schema.batchItems).values({
        batchId: batch.id,
        recipeId: item.recipeId ?? null, productId: item.productId ?? null,
        variantId: item.variantId ?? null, ingredientId: item.ingredientId ?? null,
        amount: item.amount ?? null,
      }).run();

      if (item.recipeId != null) {
        const servings = (item.amount ?? 1) * input.mealsTotal;
        recordCooked(tx as unknown as Db, householdId, item.recipeId, servings, null);
      } else if (item.productId != null) {
        const [p] = tx.select({ ingredientId: schema.products.ingredientId })
          .from(schema.products).where(eq(schema.products.id, item.productId)).all();
        if (p) {
          recordMovement(tx as unknown as Db, householdId, {
            ingredientId: p.ingredientId, productId: item.productId, variantId: item.variantId ?? null,
            delta: -(item.amount ?? 0) * input.mealsTotal, reason: "cooked", mealEventId: null,
          });
        }
      }
      // ponytail: raw-ingredient batch items deferred to a later plan; components
      // in practice are recipes (biryani/sabji) or products (frozen veg/chapathi).
    }
    return batch;
  });
}
