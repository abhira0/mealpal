import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { effectivePrice } from "@/lib/products";
import type { DeleteResult } from "@/lib/shops";

type Db = BetterSQLite3Database<typeof schema>;

export interface RecipeInput {
  name: string;
  baseServings: number;
  notes: string | null;
  totalMinutes?: number | null;
  ingredients: { ingredientId: number; amount: number }[];
  steps: StepInput[];
  media: { kind: string; url: string }[];
}

export type StepInput = { text: string; startSeconds?: number | null; endSeconds?: number | null };

/** Coerce a request body step (string legacy, or object) into a StepInput. */
export function normalizeStep(s: unknown): StepInput {
  if (typeof s === "string") return { text: s, startSeconds: null, endSeconds: null };
  const o = (s ?? {}) as { text?: unknown; startSeconds?: unknown; endSeconds?: unknown };
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);
  return { text: String(o.text ?? ""), startSeconds: num(o.startSeconds), endSeconds: num(o.endSeconds) };
}

export function createRecipe(db: Db, householdId: number, input: RecipeInput) {
  return db.transaction((tx) => {
    const [recipe] = tx.insert(schema.recipes)
      .values({ householdId, name: input.name, baseServings: input.baseServings, notes: input.notes, totalMinutes: input.totalMinutes ?? null })
      .returning().all();
    for (const ing of input.ingredients) {
      tx.insert(schema.recipeIngredients)
        .values({ recipeId: recipe.id, ingredientId: ing.ingredientId, amount: ing.amount }).run();
    }
    input.steps.forEach((s, i) => {
      tx.insert(schema.recipeSteps)
        .values({ recipeId: recipe.id, position: i, text: s.text, startSeconds: s.startSeconds ?? null, endSeconds: s.endSeconds ?? null }).run();
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
      .set({ name: input.name, baseServings: input.baseServings, notes: input.notes, totalMinutes: input.totalMinutes ?? null })
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
    input.steps.forEach((s, i) => {
      tx.insert(schema.recipeSteps)
        .values({ recipeId: id, position: i, text: s.text, startSeconds: s.startSeconds ?? null, endSeconds: s.endSeconds ?? null }).run();
    });
    for (const m of input.media) {
      tx.insert(schema.recipeMedia).values({ recipeId: id, kind: m.kind, url: m.url }).run();
    }
    return updated[0];
  });
}

export function deleteRecipe(db: Db, householdId: number, id: number): DeleteResult {
  const [recipe] = db.select().from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId))).all();
  if (!recipe) return { ok: true, deleted: false };
  const eventCount = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.householdId, householdId), eq(schema.mealEvents.recipeId, id))).all().length;
  if (eventCount > 0) {
    return { ok: false, reason: `Can't delete: ${eventCount} planned ${eventCount === 1 ? "meal uses" : "meals use"} this recipe.` };
  }
  const ruleCount = db.select().from(schema.mealRules)
    .where(and(eq(schema.mealRules.householdId, householdId), eq(schema.mealRules.recipeId, id))).all().length;
  if (ruleCount > 0) {
    return { ok: false, reason: `Can't delete: ${ruleCount} recurring ${ruleCount === 1 ? "rule uses" : "rules use"} this recipe.` };
  }
  return db.transaction((tx) => {
    tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id)).run();
    tx.delete(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, id)).run();
    tx.delete(schema.recipeMedia).where(eq(schema.recipeMedia.recipeId, id)).run();
    const rows = tx.delete(schema.recipes)
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, householdId)))
      .returning().all();
    return { ok: true, deleted: rows.length > 0 };
  });
}

export function listRecipes(db: Db, householdId: number) {
  const recipes = db.select().from(schema.recipes)
    .where(eq(schema.recipes.householdId, householdId)).all();
  return recipes.map((recipe) => {
    const ingredients = db.select().from(schema.recipeIngredients)
      .where(eq(schema.recipeIngredients.recipeId, recipe.id)).all();
    return { ...recipe, costCents: recipeCostCents(db, householdId, ingredients) };
  });
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
