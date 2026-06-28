import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import type { DeleteResult } from "@/lib/shops";

type Db = BetterSQLite3Database<typeof schema>;

export interface IngredientInput {
  name: string;
  canonicalUnit: string;
  servingSize: number | null;
}

export function createIngredient(db: Db, householdId: number, input: IngredientInput) {
  const [row] = db
    .insert(schema.ingredients)
    .values({ householdId, ...input })
    .returning()
    .all();
  return row;
}

export function listIngredients(db: Db, householdId: number) {
  return db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all();
}

export function updateIngredient(
  db: Db,
  householdId: number,
  id: number,
  patch: Partial<IngredientInput>,
) {
  const [row] = db
    .update(schema.ingredients)
    .set(patch)
    .where(
      and(
        eq(schema.ingredients.id, id),
        eq(schema.ingredients.householdId, householdId),
      ),
    )
    .returning()
    .all();
  return row; // undefined if no row matched the household scope
}

export function deleteIngredient(
  db: Db,
  householdId: number,
  id: number,
): DeleteResult {
  const productCount = db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, id),
      ),
    )
    .all().length;
  if (productCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${productCount} ${productCount === 1 ? "product uses" : "products use"} this ingredient.`,
    };
  }
  const recipeRefCount = db
    .select()
    .from(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.ingredientId, id))
    .all().length;
  if (recipeRefCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${recipeRefCount} ${recipeRefCount === 1 ? "recipe uses" : "recipes use"} this ingredient.`,
    };
  }
  const rows = db
    .delete(schema.ingredients)
    .where(
      and(
        eq(schema.ingredients.id, id),
        eq(schema.ingredients.householdId, householdId),
      ),
    )
    .returning()
    .all();
  return { ok: true, deleted: rows.length > 0 };
}
