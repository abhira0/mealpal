import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { consumptionForRecipe } from "@/lib/consumption";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

type Db = BetterSQLite3Database<typeof schema>;

// Nutrition is stored PER CANONICAL UNIT on each product (kcal/g, etc.), so a
// total is just (canonical units consumed) × (per-unit value), summed. Every
// field on a Nutrition Facts label; null on a product = not filled in.
export const NUTRIENT_KEYS = [
  "calories", "fatG", "satFatG", "transFatG", "polyFatG", "monoFatG",
  "cholesterolMg", "sodiumMg", "carbsG", "fiberG", "sugarG", "addedSugarG",
  "proteinG", "vitaminDMcg", "calciumMg", "ironMg", "potassiumMg",
  "vitaminAMcg", "vitaminCMg",
] as const;

export type Nutrients = Record<(typeof NUTRIENT_KEYS)[number], number>;

export function zeroNutrients(): Nutrients {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Nutrients;
}

function addScaled(acc: Nutrients, n: Nutrients, factor: number) {
  for (const k of NUTRIENT_KEYS) acc[k] += (n[k] ?? 0) * factor;
}

type ProductRow = typeof schema.products.$inferSelect;

/**
 * Has nutrition been filled in? True when any nutrient is non-null and
 * non-zero — covers manual entry of just protein/etc. without calories, and
 * photo-less manual saves. (calories alone is not the sentinel.)
 */
export function hasNutrition(p: ProductRow): boolean {
  return NUTRIENT_KEYS.some((k) => ((p[k] as number | null) ?? 0) !== 0);
}

/** A product's per-unit nutrients, or null if it hasn't been filled in yet. */
function productNutrients(p: ProductRow): Nutrients | null {
  if (!hasNutrition(p)) return null;
  return Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, (p[k] as number | null) ?? 0]),
  ) as Nutrients;
}

export interface MealNutrition {
  eventId: number;
  recipeName: string;
  slotName: string;
  servings: number;
  /** true = derived from the meal plan's preferred product (not yet cooked). */
  estimate: boolean;
  nutrients: Nutrients;
  /** ingredient names with no usable nutrition data, so totals undercount. */
  missing: string[];
}

export interface DayNutrition {
  date: string;
  meals: MealNutrition[];
  total: Nutrients;
  /** distinct ingredient names missing nutrition across the day. */
  missing: string[];
}

/**
 * Nutrition for every meal on `date`, plus the day total.
 * - Cooked meals are exact: read the cook's stock movements, which record the
 *   actual product consumed per ingredient, × per-unit nutrition.
 * - Planned meals are estimated: scale the recipe and use each ingredient's
 *   preferred available product that has nutrition filled in.
 */
export function dayNutrition(db: Db, householdId: number, date: string): DayNutrition {
  const events = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.householdId, householdId), eq(schema.mealEvents.date, date)))
    .all();

  const slots = new Map(
    db.select().from(schema.mealSlots).where(eq(schema.mealSlots.householdId, householdId)).all()
      .map((s) => [s.id, s.name]),
  );
  const ingredientName = new Map(
    db.select().from(schema.ingredients).where(eq(schema.ingredients.householdId, householdId)).all()
      .map((i) => [i.id, i.name]),
  );
  const productById = new Map(
    db.select().from(schema.products).where(eq(schema.products.householdId, householdId)).all()
      .map((p) => [p.id, p]),
  );

  const meals: MealNutrition[] = [];
  for (const ev of events) {
    const recipe = getRecipe(db, householdId, ev.recipeId);
    if (!recipe) continue;
    const nutrients = zeroNutrients();
    const missing = new Set<number>();

    if (ev.status === "cooked") {
      const moves = db.select().from(schema.stockMovements)
        .where(and(
          eq(schema.stockMovements.householdId, householdId),
          eq(schema.stockMovements.mealEventId, ev.id),
          eq(schema.stockMovements.reason, "cooked"),
        )).all();
      for (const m of moves) {
        const p = m.productId != null ? productById.get(m.productId) : undefined;
        const pn = p ? productNutrients(p) : null;
        if (!pn) { missing.add(m.ingredientId); continue; }
        addScaled(nutrients, pn, Math.abs(m.delta));
      }
    } else {
      for (const line of consumptionForRecipe(recipe, ev.servings)) {
        const pn = preferredNutrients(db, householdId, line.ingredientId);
        if (!pn) { missing.add(line.ingredientId); continue; }
        addScaled(nutrients, pn, line.amount);
      }
    }

    meals.push({
      eventId: ev.id,
      recipeName: recipe.name,
      slotName: slots.get(ev.slotId) ?? "—",
      servings: ev.servings,
      estimate: ev.status !== "cooked",
      nutrients,
      missing: [...missing].map((id) => ingredientName.get(id) ?? "?"),
    });
  }

  const total = zeroNutrients();
  const missing = new Set<string>();
  for (const m of meals) {
    addScaled(total, m.nutrients, 1);
    for (const name of m.missing) missing.add(name);
  }
  return { date, meals, total, missing: [...missing] };
}

/** Preferred available product (lowest priority) that has nutrition filled in. */
function preferredNutrients(db: Db, householdId: number, ingredientId: number): Nutrients | null {
  const products = db.select().from(schema.products)
    .where(and(
      eq(schema.products.householdId, householdId),
      eq(schema.products.ingredientId, ingredientId),
      eq(schema.products.available, true),
    ))
    .orderBy(asc(schema.products.priority)).all();
  for (const p of products) {
    const pn = productNutrients(p);
    if (pn) return pn;
  }
  return null;
}

/** Preferred available product row (lowest priority) with nutrition filled in. */
function preferredProduct(db: Db, householdId: number, ingredientId: number): ProductRow | null {
  const products = db.select().from(schema.products)
    .where(and(
      eq(schema.products.householdId, householdId),
      eq(schema.products.ingredientId, ingredientId),
      eq(schema.products.available, true),
    ))
    .orderBy(asc(schema.products.priority)).all();
  return products.find(hasNutrition) ?? null;
}

type NutrientValues = Partial<Record<(typeof NUTRIENT_PATCH_KEYS)[number], number>>;

export interface RecipeNutrition {
  /** per-serving value per nutrient (all keys; absent = unknown). */
  perServing: NutrientValues;
  /** per-serving contribution of each ingredient (for the breakdown table). */
  byIngredient: { ingredientId: number; name: string; unit: string; amount: number; values: NutrientValues }[];
  /** ingredient names whose preferred product has no nutrition, so totals undercount. */
  missing: string[];
}

/**
 * A recipe's per-serving nutrition: sum each ingredient's preferred-product
 * per-unit values × its amount, then divide by baseServings. Covers the full
 * nutrient set (incl. micronutrients), unlike the meal-plan Nutrients subset.
 */
export function recipeNutrition(
  db: Db,
  householdId: number,
  recipe: { baseServings: number; ingredients: { ingredientId: number; amount: number }[] },
): RecipeNutrition {
  const ingredientInfo = new Map(
    db.select().from(schema.ingredients).where(eq(schema.ingredients.householdId, householdId)).all()
      .map((i) => [i.id, { name: i.name, unit: i.canonicalUnit }]),
  );
  const denom = recipe.baseServings > 0 ? recipe.baseServings : 1;
  const totals: Record<string, number> = {};
  const byIngredient: RecipeNutrition["byIngredient"] = [];
  const missing = new Set<string>();
  for (const line of recipe.ingredients) {
    const info = ingredientInfo.get(line.ingredientId);
    const name = info?.name ?? "?";
    const p = preferredProduct(db, householdId, line.ingredientId);
    if (!p) { missing.add(name); continue; }
    const values: NutrientValues = {};
    for (const k of NUTRIENT_PATCH_KEYS) {
      const v = p[k];
      if (v == null) continue;
      values[k] = (v * line.amount) / denom; // per-serving contribution
      totals[k] = (totals[k] ?? 0) + v * line.amount;
    }
    byIngredient.push({ ingredientId: line.ingredientId, name, unit: info?.unit ?? "", amount: line.amount / denom, values });
  }
  const perServing: NutrientValues = {};
  for (const k of NUTRIENT_PATCH_KEYS) if (totals[k] != null) perServing[k] = totals[k] / denom;
  return { perServing, byIngredient, missing: [...missing] };
}

export interface IngredientNutritionRow {
  ingredientId: number;
  name: string;
  unit: string;
  productName: string;
  /** canonical units actually used across the day's meals. */
  qty: number;
  /** total nutrient contribution for that qty (per-unit × qty). */
  values: Partial<Record<(typeof NUTRIENT_PATCH_KEYS)[number], number>>;
}

/**
 * Per-ingredient breakdown of what was actually used on `date`: the same
 * consumption dayNutrition sums (cooked → stock movements, planned → scaled
 * recipe × preferred product), aggregated per ingredient. So the column Total
 * equals the day total, unlike a per-100 comparison.
 */
export function dayIngredientTable(db: Db, householdId: number, date: string): IngredientNutritionRow[] {
  const events = db.select().from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.householdId, householdId), eq(schema.mealEvents.date, date)))
    .all();
  const ingredientById = new Map(
    db.select().from(schema.ingredients).where(eq(schema.ingredients.householdId, householdId)).all()
      .map((i) => [i.id, i]),
  );
  const productById = new Map(
    db.select().from(schema.products).where(eq(schema.products.householdId, householdId)).all()
      .map((p) => [p.id, p]),
  );

  // ingredientId -> accumulating row
  const rows = new Map<number, IngredientNutritionRow>();
  const accumulate = (ingredientId: number, qty: number, p: ProductRow) => {
    const ing = ingredientById.get(ingredientId);
    let row = rows.get(ingredientId);
    if (!row) {
      row = { ingredientId, name: ing?.name ?? "?", unit: ing?.canonicalUnit ?? "", productName: p.name, qty: 0, values: {} };
      rows.set(ingredientId, row);
    }
    row.qty += qty;
    for (const k of NUTRIENT_PATCH_KEYS) {
      if (p[k] == null) continue;
      row.values[k] = (row.values[k] ?? 0) + p[k]! * qty;
    }
  };

  for (const ev of events) {
    const recipe = getRecipe(db, householdId, ev.recipeId);
    if (!recipe) continue;
    if (ev.status === "cooked") {
      const moves = db.select().from(schema.stockMovements)
        .where(and(
          eq(schema.stockMovements.householdId, householdId),
          eq(schema.stockMovements.mealEventId, ev.id),
          eq(schema.stockMovements.reason, "cooked"),
        )).all();
      for (const m of moves) {
        const p = m.productId != null ? productById.get(m.productId) : undefined;
        if (!p || !hasNutrition(p)) continue; // no usable nutrition
        accumulate(m.ingredientId, Math.abs(m.delta), p);
      }
    } else {
      for (const line of consumptionForRecipe(recipe, ev.servings)) {
        const p = preferredProduct(db, householdId, line.ingredientId);
        if (!p) continue;
        accumulate(line.ingredientId, line.amount, p);
      }
    }
  }
  return [...rows.values()];
}
