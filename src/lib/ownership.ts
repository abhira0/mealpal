import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export interface OwnedRefs {
  slotId?: number | null;
  recipeId?: number | null;
  ingredientId?: number | null;
  productId?: number | null;
  variantId?: number | null;
}

/**
 * Throws if any of the given ids don't belong to `householdId`. Every one of
 * these is a foreign key that can arrive straight off a request body
 * (slotId, recipeId, ingredientId, productId, variantId) — without this check
 * a household could point a meal event or recurring rule at another
 * household's row (recipe/product/etc.), which then leaks that household's
 * data into the plan and consumes stock from the wrong place. Shared by
 * addEvent/updateEvent (src/lib/plan.ts) and createRule (src/lib/rules.ts) so
 * the guarantee holds regardless of entry point.
 */
export function assertOwnedRefs(db: Db, householdId: number, input: OwnedRefs) {
  const owns = (exists: boolean, what: string) => {
    if (!exists) throw new Error(`${what} not found in household`);
  };
  if (input.slotId != null) {
    const [row] = db.select({ id: schema.mealSlots.id }).from(schema.mealSlots)
      .where(and(eq(schema.mealSlots.id, input.slotId), eq(schema.mealSlots.householdId, householdId))).all();
    owns(!!row, "slot");
  }
  if (input.recipeId != null) {
    const [row] = db.select({ id: schema.recipes.id }).from(schema.recipes)
      .where(and(eq(schema.recipes.id, input.recipeId), eq(schema.recipes.householdId, householdId))).all();
    owns(!!row, "recipe");
  }
  if (input.ingredientId != null) {
    const [row] = db.select({ id: schema.ingredients.id }).from(schema.ingredients)
      .where(and(eq(schema.ingredients.id, input.ingredientId), eq(schema.ingredients.householdId, householdId))).all();
    owns(!!row, "ingredient");
  }
  if (input.productId != null) {
    const [row] = db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    owns(!!row, "product");
  }
  if (input.variantId != null) {
    const [row] = db.select({ id: schema.productVariants.id }).from(schema.productVariants)
      .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.householdId, householdId))).all();
    owns(!!row, "variant");
  }
}
