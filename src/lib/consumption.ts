import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { recordMovement, stockByProduct } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface ConsumptionLine { ingredientId: number; amount: number; }

/**
 * Products of an ingredient that currently have stock on hand, preferred
 * (lowest priority) first. Used to attribute a cook to a specific product.
 */
function inStockProductsByIngredient(db: Db, householdId: number): Map<number, number[]> {
  const onHand = stockByProduct(db, householdId);
  const products = db.select({
    id: schema.products.id, ingredientId: schema.products.ingredientId,
  })
    .from(schema.products)
    .where(eq(schema.products.householdId, householdId))
    .orderBy(asc(schema.products.priority)).all();
  const out = new Map<number, number[]>();
  for (const p of products) {
    if ((onHand.get(p.id) ?? 0) <= 0) continue;
    const list = out.get(p.ingredientId) ?? [];
    list.push(p.id);
    out.set(p.ingredientId, list);
  }
  return out;
}

export interface CookChoice {
  ingredientId: number;
  ingredientName: string;
  products: { id: number; name: string; onHand: number }[];
}

/**
 * Ingredients in this event's recipe that have MORE THAN ONE product in stock,
 * so the cook can't be attributed automatically — the user must pick which one
 * they used. Ingredients with 0 or 1 in-stock products are resolved silently.
 */
export function cookChoices(db: Db, householdId: number, eventId: number): CookChoice[] {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev) return [];
  const recipe = getRecipe(db, householdId, ev.recipeId);
  if (!recipe) return [];
  const inStock = inStockProductsByIngredient(db, householdId);
  const onHand = stockByProduct(db, householdId);
  const choices: CookChoice[] = [];
  for (const line of consumptionForRecipe(recipe, ev.servings)) {
    const ids = inStock.get(line.ingredientId) ?? [];
    if (ids.length < 2) continue; // 0 or 1 → resolved automatically
    const products = db.select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, line.ingredientId),
      )).all();
    const ing = db.select({ name: schema.ingredients.name }).from(schema.ingredients)
      .where(eq(schema.ingredients.id, line.ingredientId)).all()[0];
    choices.push({
      ingredientId: line.ingredientId,
      ingredientName: ing?.name ?? "?",
      products: products
        .filter((p) => ids.includes(p.id))
        .map((p) => ({ id: p.id, name: p.name, onHand: onHand.get(p.id) ?? 0 })),
    });
  }
  return choices;
}

/**
 * Ingredient names in this event's recipe that have NO in-stock product to
 * attribute a cook to. Cooking is blocked when this is non-empty — every cooked
 * meal must map to real products so nutrition/stock totals stay trustworthy.
 */
export function unstockedIngredients(db: Db, householdId: number, eventId: number): string[] {
  const [ev] = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (!ev) return [];
  const recipe = getRecipe(db, householdId, ev.recipeId);
  if (!recipe) return [];
  const inStock = inStockProductsByIngredient(db, householdId);
  const missing: string[] = [];
  for (const line of consumptionForRecipe(recipe, ev.servings)) {
    if ((inStock.get(line.ingredientId) ?? []).length > 0) continue;
    const ing = db.select({ name: schema.ingredients.name }).from(schema.ingredients)
      .where(eq(schema.ingredients.id, line.ingredientId)).all()[0];
    missing.push(ing?.name ?? "?");
  }
  return missing;
}

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

/**
 * Mark a recipe cooked: write negative stock movements per ingredient, each
 * attributed to a product. `allocations` (ingredientId -> productId) is the
 * user's pick from cookChoices. When absent, attribute to the single in-stock
 * product, or fall back to the preferred (lowest-priority) one; null only if
 * nothing is in stock.
 * // ponytail: preferred-product fallback; the cookChoices picker is the real path
 */
export function recordCooked(
  db: Db, householdId: number, recipeId: number, servings: number, mealEventId: number | null,
  allocations?: Map<number, number>,
) {
  const recipe = getRecipe(db, householdId, recipeId);
  if (!recipe) throw new Error("recipe not found in household");
  const inStock = inStockProductsByIngredient(db, householdId);
  const lines = consumptionForRecipe(recipe, servings);
  for (const line of lines) {
    const ids = inStock.get(line.ingredientId) ?? [];
    const chosen = allocations?.get(line.ingredientId);
    const productId = (chosen && ids.includes(chosen)) ? chosen : (ids[0] ?? null);
    recordMovement(db, householdId, {
      ingredientId: line.ingredientId, productId, delta: -line.amount, reason: "cooked", mealEventId,
    });
  }
  return lines;
}
