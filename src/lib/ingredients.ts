import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

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
