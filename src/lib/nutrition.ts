import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { getRecipe } from "@/lib/recipes";
import { consumptionForRecipe } from "@/lib/consumption";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";
import { listEaten } from "@/lib/eaten";

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

type VariantRow = typeof schema.productVariants.$inferSelect;
/** A variant's per-unit nutrients, or null if nothing is filled in. */
function variantNutrients(v: VariantRow): Nutrients | null {
  if (!NUTRIENT_KEYS.some((k) => ((v[k] as number | null) ?? 0) !== 0)) return null;
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, (v[k] as number | null) ?? 0])) as Nutrients;
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
  const variantById = new Map(
    db.select().from(schema.productVariants).where(eq(schema.productVariants.householdId, householdId)).all()
      .map((v) => [v.id, v]),
  );

  const meals: MealNutrition[] = [];
  for (const ev of events) {
    const nutrients = zeroNutrients();
    const missing = new Set<number>();
    let name = "Item";

    if (ev.recipeId != null) {
      const recipe = getRecipe(db, householdId, ev.recipeId);
      if (!recipe) continue;
      name = recipe.name;
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
    } else {
      // direct item: nutrition = source per-unit × amount (same planned or cooked)
      const amount = ev.amount ?? 0;
      if (ev.productId != null) {
        const variant = ev.variantId != null ? variantById.get(ev.variantId) : undefined;
        const p = productById.get(ev.productId);
        const src = variant ? variantNutrients(variant) : (p ? productNutrients(p) : null);
        name = variant?.name ?? p?.name ?? "Item";
        if (src) addScaled(nutrients, src, amount);
        else if (p) missing.add(p.ingredientId);
      } else if (ev.ingredientId != null) {
        const pn = preferredNutrients(db, householdId, ev.ingredientId);
        name = ingredientName.get(ev.ingredientId) ?? "Item";
        if (pn) addScaled(nutrients, pn, amount);
        else missing.add(ev.ingredientId);
      }
    }

    meals.push({
      eventId: ev.id,
      recipeName: name,
      slotName: slots.get(ev.slotId) ?? "—",
      servings: ev.servings,
      estimate: ev.status !== "cooked",
      nutrients,
      missing: [...missing].map((id) => ingredientName.get(id) ?? "?"),
    });
  }

  // Quick-logged snacks/packets eaten this day (not part of a recipe meal).
  for (const c of listEaten(db, householdId, date)) {
    const p = productById.get(c.productId);
    const variant = c.variantId != null ? variantById.get(c.variantId) : undefined;
    const n = variant ? variantNutrients(variant) : (p ? productNutrients(p) : null);
    const nutrients = zeroNutrients();
    const miss = new Set<number>();
    if (n) addScaled(nutrients, n, c.count); // c.count is canonical units
    else if (p) miss.add(p.ingredientId);
    // show packets eaten, not raw canonical units (e.g. 1 packet, not 43 g)
    const perServing = variant?.servingSize && variant.servingSize > 0 ? variant.servingSize : 1;
    meals.push({
      eventId: -c.id, // negative id namespace so it can't collide with mealEvents
      recipeName: variant?.name ?? p?.name ?? "Snack",
      slotName: "Snack",
      servings: c.count / perServing,
      estimate: false,
      nutrients,
      missing: [...miss].map((id) => ingredientName.get(id) ?? "?"),
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

  const variantById = new Map(
    db.select().from(schema.productVariants).where(eq(schema.productVariants.householdId, householdId)).all()
      .map((v) => [v.id, v]),
  );

  // ingredientId -> accumulating row. `src` carries the nutrient columns (a
  // product row, or a pack variant); `productName` labels the row.
  const rows = new Map<number, IngredientNutritionRow>();
  const accumulateSrc = (
    ingredientId: number, qty: number,
    src: Partial<Record<(typeof NUTRIENT_PATCH_KEYS)[number], number | null>>, productName: string,
  ) => {
    const ing = ingredientById.get(ingredientId);
    let row = rows.get(ingredientId);
    if (!row) {
      row = { ingredientId, name: ing?.name ?? "?", unit: ing?.canonicalUnit ?? "", productName, qty: 0, values: {} };
      rows.set(ingredientId, row);
    }
    row.qty += qty;
    for (const k of NUTRIENT_PATCH_KEYS) {
      const v = src[k];
      if (v == null) continue;
      row.values[k] = (row.values[k] ?? 0) + v * qty;
    }
  };
  const accumulate = (ingredientId: number, qty: number, p: ProductRow) => accumulateSrc(ingredientId, qty, p, p.name);

  for (const ev of events) {
    if (ev.recipeId != null) {
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
    } else {
      // direct item: product/variant or ingredient (preferred product) × amount
      const amount = ev.amount ?? 0;
      if (ev.productId != null) {
        const p = productById.get(ev.productId);
        if (!p) continue;
        const variant = ev.variantId != null ? variantById.get(ev.variantId) : undefined;
        accumulateSrc(p.ingredientId, amount, variant ?? p, variant?.name ?? p.name);
      } else if (ev.ingredientId != null) {
        const p = preferredProduct(db, householdId, ev.ingredientId);
        if (p) accumulate(ev.ingredientId, amount, p);
      }
    }
  }

  for (const c of listEaten(db, householdId, date)) {
    const p = productById.get(c.productId);
    if (!p) continue;
    const src = c.variantId != null ? variantById.get(c.variantId) : p;
    if (!src) continue;
    const ing = ingredientById.get(p.ingredientId);
    const rowKey = p.ingredientId;
    let row = rows.get(rowKey);
    if (!row) {
      row = { ingredientId: rowKey, name: ing?.name ?? "?", unit: ing?.canonicalUnit ?? "", productName: c.variantId != null ? (variantById.get(c.variantId)?.name ?? p.name) : p.name, qty: 0, values: {} };
      rows.set(rowKey, row);
    }
    row.qty += c.count;
    for (const k of NUTRIENT_PATCH_KEYS) {
      const val = (src as Record<string, unknown>)[k] as number | null | undefined;
      if (val == null) continue;
      row.values[k] = (row.values[k] ?? 0) + val * c.count;
    }
  }

  return [...rows.values()];
}

/** dayIngredientTable summed across the Mon–Sun week starting `monday`. */
export function weekIngredientTable(db: Db, householdId: number, monday: string): IngredientNutritionRow[] {
  const merged = new Map<number, IngredientNutritionRow>();
  for (let i = 0; i < 7; i++) {
    for (const row of dayIngredientTable(db, householdId, isoAddDays(monday, i))) {
      const m = merged.get(row.ingredientId);
      if (!m) { merged.set(row.ingredientId, { ...row, values: { ...row.values } }); continue; }
      m.qty += row.qty;
      for (const k of NUTRIENT_PATCH_KEYS) {
        if (row.values[k] == null) continue;
        m.values[k] = (m.values[k] ?? 0) + row.values[k]!;
      }
    }
  }
  return [...merged.values()];
}

// ---------- Analysis tab: goals, scorecards, week aggregation ----------

export interface Goals { calorieGoal: number; proteinG: number; carbsG: number; fatG: number; }

/** Used when a household hasn't set goals yet, so the tab still works. */
export const DEFAULT_GOALS: Goals = { calorieGoal: 2000, proteinG: 150, carbsG: 220, fatG: 65 };

export function getGoals(db: Db, householdId: number): Goals {
  const [row] = db.select().from(schema.nutritionGoals)
    .where(eq(schema.nutritionGoals.householdId, householdId)).all();
  return row
    ? { calorieGoal: row.calorieGoal, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG }
    : DEFAULT_GOALS;
}

export function setGoals(db: Db, householdId: number, g: Goals): Goals {
  db.insert(schema.nutritionGoals).values({ householdId, ...g })
    .onConflictDoUpdate({ target: schema.nutritionGoals.householdId, set: g }).run();
  return g;
}

/**
 * Share of calories from each macro (MyFitnessPal's macro pie). Uses 4/4/9
 * kcal-per-gram; an empty day is all zeros. Percentages are 0–100 and sum to
 * ~100 (rounding aside) when there are calories.
 */
export function macroSplit(n: Nutrients): { carbs: number; fat: number; protein: number } {
  const c = 4 * n.carbsG, f = 9 * n.fatG, p = 4 * n.proteinG;
  const cal = c + f + p;
  if (cal <= 0) return { carbs: 0, fat: 0, protein: 0 };
  return { carbs: (c / cal) * 100, fat: (f / cal) * 100, protein: (p / cal) * 100 };
}

export interface Scorecard {
  key: "heartHealthy" | "lowCarb" | "highProtein";
  label: string;
  pass: boolean;
  reason: string;
}

const SODIUM_LIMIT_MG = 2300; // FDA daily limit
// ponytail: DV-based thresholds as plain constants; tune freely if needed.
/**
 * Heuristic diet badges from a day's totals (or a week's daily average).
 * Calories use the macro-derived figure (4·P + 4·C + 9·F) to avoid divide-by-zero
 * and label rounding noise. An empty day (no calories) passes nothing.
 */
export function scorecards(n: Nutrients): Scorecard[] {
  const cal = 4 * n.proteinG + 4 * n.carbsG + 9 * n.fatG;
  const has = cal > 0;
  const pct = (kcal: number) => (has ? kcal / cal : 0);
  const satPct = pct(9 * n.satFatG);
  const addedPct = pct(4 * n.addedSugarG);
  const carbPct = pct(4 * n.carbsG);
  const protPct = pct(4 * n.proteinG);
  const r = (x: number) => Math.round(x * 100);
  return [
    {
      key: "heartHealthy", label: "Heart-healthy",
      pass: has && satPct < 0.10 && n.sodiumMg < SODIUM_LIMIT_MG && addedPct < 0.10,
      reason: `Sat fat ${r(satPct)}% cal · sodium ${Math.round(n.sodiumMg)}mg · added sugar ${r(addedPct)}% cal`,
    },
    {
      key: "lowCarb", label: "Low-carb",
      pass: has && carbPct < 0.26,
      reason: `Carbs ${r(carbPct)}% of calories`,
    },
    {
      key: "highProtein", label: "High-protein",
      pass: has && protPct >= 0.25,
      reason: `Protein ${r(protPct)}% of calories`,
    },
  ];
}

/** ISO date + n days, computed in local time (no UTC drift). */
function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const z = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Monday (week start) of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const dow = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7; // Mon=0
  return isoAddDays(iso, -dow);
}

export interface WeekNutrition {
  monday: string;
  perDay: { date: string; total: Nutrients; hasMeals: boolean }[];
  /** average over days that have meals only (partial weeks aren't dragged down). */
  average: Nutrients;
  daysWithMeals: number;
  missing: string[];
}

export function weekNutrition(db: Db, householdId: number, monday: string): WeekNutrition {
  const perDay: WeekNutrition["perDay"] = [];
  const sum = zeroNutrients();
  const missing = new Set<string>();
  let daysWithMeals = 0;
  for (let i = 0; i < 7; i++) {
    const date = isoAddDays(monday, i);
    const day = dayNutrition(db, householdId, date);
    const hasMeals = day.meals.length > 0;
    if (hasMeals) {
      daysWithMeals++;
      addScaled(sum, day.total, 1);
      for (const m of day.missing) missing.add(m);
    }
    perDay.push({ date, total: day.total, hasMeals });
  }
  const average = zeroNutrients();
  if (daysWithMeals > 0) for (const k of NUTRIENT_KEYS) average[k] = sum[k] / daysWithMeals;
  return { monday, perDay, average, daysWithMeals, missing: [...missing] };
}
