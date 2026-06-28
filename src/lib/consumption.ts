import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { recordMovement } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface ConsumptionLine { ingredientId: number; amount: number; }

/** Pure: scale a recipe's ingredient amounts to the requested servings. */
export function consumptionForRecipe(
  recipe: { baseServings: number; ingredients: { ingredientId: number; amount: number }[] },
  servings: number,
): ConsumptionLine[] {
  const factor = servings / recipe.baseServings;
  return recipe.ingredients.map((i) => ({
    ingredientId: i.ingredientId,
    amount: Math.round(i.amount * factor),
  }));
}

/** Mark a recipe cooked: write negative stock movements for each ingredient. */
export function recordCooked(
  db: Db, householdId: number, recipeId: number, servings: number, mealEventId: number | null,
) {
  const recipe = getRecipe(db, householdId, recipeId);
  if (!recipe) throw new Error("recipe not found in household");
  const lines = consumptionForRecipe(recipe, servings);
  for (const line of lines) {
    recordMovement(db, householdId, {
      ingredientId: line.ingredientId, delta: -line.amount, reason: "cooked", mealEventId,
    });
  }
  return lines;
}
