import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { effectivePrice } from "@/lib/products";

type Db = BetterSQLite3Database<typeof schema>;

export interface RecipeInput {
  name: string;
  baseServings: number;
  notes: string | null;
  ingredients: { ingredientId: number; amount: number }[];
  steps: string[];
  media: { kind: string; url: string }[];
}

export function createRecipe(db: Db, householdId: number, input: RecipeInput) {
  return db.transaction((tx) => {
    const [recipe] = tx.insert(schema.recipes)
      .values({ householdId, name: input.name, baseServings: input.baseServings, notes: input.notes })
      .returning().all();
    for (const ing of input.ingredients) {
      tx.insert(schema.recipeIngredients)
        .values({ recipeId: recipe.id, ingredientId: ing.ingredientId, amount: ing.amount }).run();
    }
    input.steps.forEach((text, i) => {
      tx.insert(schema.recipeSteps).values({ recipeId: recipe.id, position: i, text }).run();
    });
    for (const m of input.media) {
      tx.insert(schema.recipeMedia).values({ recipeId: recipe.id, kind: m.kind, url: m.url }).run();
    }
    return recipe;
  });
}

export function updateRecipe(db: Db, householdId: number, id: number, input: RecipeInput) {
  return db.transaction((tx) => {
    const updated = tx.update(schema.recipes)
      .set({ name: input.name, baseServings: input.baseServings, notes: input.notes })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId)))
      .returning().all();
    if (updated.length === 0) return undefined; // not found / not yours
    // ponytail: replace children wholesale instead of diffing — recipes are small
    tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id)).run();
    tx.delete(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, id)).run();
    tx.delete(schema.recipeMedia).where(eq(schema.recipeMedia.recipeId, id)).run();
    for (const ing of input.ingredients) {
      tx.insert(schema.recipeIngredients)
        .values({ recipeId: id, ingredientId: ing.ingredientId, amount: ing.amount }).run();
    }
    input.steps.forEach((text, i) => {
      tx.insert(schema.recipeSteps).values({ recipeId: id, position: i, text }).run();
    });
    for (const m of input.media) {
      tx.insert(schema.recipeMedia).values({ recipeId: id, kind: m.kind, url: m.url }).run();
    }
    return updated[0];
  });
}

export function listRecipes(db: Db, householdId: number) {
  return db.select().from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId)).all();
}

export function getRecipe(db: Db, householdId: number, id: number) {
  const [recipe] = db.select().from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId))).all();
  if (!recipe) return undefined;
  const ingredients = db.select().from(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.recipeId, id)).all();
  const steps = db.select().from(schema.recipeSteps)
    .where(eq(schema.recipeSteps.recipeId, id)).orderBy(asc(schema.recipeSteps.position)).all();
  const media = db.select().from(schema.recipeMedia)
    .where(eq(schema.recipeMedia.recipeId, id)).all();
  return { ...recipe, ingredients, steps, media, costCents: recipeCostCents(db, householdId, ingredients) };
}

/**
 * Cost in cents to cook the recipe at baseServings, or null if any ingredient's
 * top-priority available product has no effective price. Each ingredient costs
 * (amount / packSize) * price, using the same top-priority pick as shopping.
 */
function recipeCostCents(
  db: Db, householdId: number,
  ingredients: { ingredientId: number; amount: number }[],
): number | null {
  let total = 0;
  for (const line of ingredients) {
    const [product] = db.select().from(schema.products)
      .where(and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, line.ingredientId),
        eq(schema.products.available, true),
      ))
      .orderBy(asc(schema.products.priority)).limit(1).all();
    if (!product || product.packSize <= 0) return null;
    const price = effectivePrice(db, product.id);
    if (price == null) return null;
    total += (line.amount / product.packSize) * price;
  }
  return Math.round(total);
}
