import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { consumptionLinesForEvent } from "@/lib/consumption";
import { stockByIngredient } from "@/lib/stock";
import { dayNutrition } from "@/lib/nutrition";
import { getEvent } from "@/lib/plan";

type Db = BetterSQLite3Database<typeof schema>;

// One ingredient this meal will deplete: how much it needs vs what's on hand.
export interface StockImpactLine {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  needed: number;
  onHand: number;
  short: boolean;
}

export interface InspectResult {
  event: {
    id: number;
    date: string;
    slotId: number;
    slotName: string;
    status: "planned" | "cooked" | "served";
    cookedAhead: boolean;
    ruleId: number | null;
    servings: number;
    amount: number | null;
    recipeId: number | null;
    productId: number | null;
    ingredientId: number | null;
    variantId: number | null;
    name: string;
    variantName: string | null;
  };
  // What it depletes, needed vs on-hand. Empty for items with no consumption.
  stock: StockImpactLine[];
  // Planned/actual macros for just this meal (the four the UI shows).
  macros: { calories: number; proteinG: number; carbsG: number; fatG: number };
  // Ingredient names with no usable nutrition data (macros undercount).
  missing: string[];
}

/**
 * Everything the Plan inspector shows for one meal event: resolved names, the
 * per-ingredient stock impact (needed vs on-hand vs short), and this meal's
 * macros. Composed from existing primitives — no new consumption/nutrition
 * logic. Returns null if the event isn't in the household.
 */
export function inspectEvent(db: Db, householdId: number, eventId: number): InspectResult | null {
  const ev = getEvent(db, householdId, eventId);
  if (!ev) return null;

  const [slot] = db.select({ name: schema.mealSlots.name }).from(schema.mealSlots)
    .where(eq(schema.mealSlots.id, ev.slotId)).all();

  // Resolve display name + variant name by item kind.
  let name = "Item";
  let variantName: string | null = null;
  if (ev.recipeId != null) {
    const [r] = db.select({ name: schema.recipes.name }).from(schema.recipes)
      .where(and(eq(schema.recipes.id, ev.recipeId), eq(schema.recipes.householdId, householdId))).all();
    name = r?.name ?? "Recipe";
  } else if (ev.productId != null) {
    const [p] = db.select({ name: schema.products.name }).from(schema.products)
      .where(and(eq(schema.products.id, ev.productId), eq(schema.products.householdId, householdId))).all();
    name = p?.name ?? "Product";
    if (ev.variantId != null) {
      const [v] = db.select({ name: schema.productVariants.name }).from(schema.productVariants)
        .where(eq(schema.productVariants.id, ev.variantId)).all();
      variantName = v?.name ?? null;
    }
  } else if (ev.ingredientId != null) {
    const [i] = db.select({ name: schema.ingredients.name }).from(schema.ingredients)
      .where(and(eq(schema.ingredients.id, ev.ingredientId), eq(schema.ingredients.householdId, householdId))).all();
    name = i?.name ?? "Ingredient";
  }

  // Stock impact: needed (consumption lines) vs on-hand (by ingredient).
  const onHand = stockByIngredient(db, householdId);
  const ingredientRows = db.select({ id: schema.ingredients.id, name: schema.ingredients.name, unit: schema.ingredients.canonicalUnit })
    .from(schema.ingredients).where(eq(schema.ingredients.householdId, householdId)).all();
  const ingById = new Map(ingredientRows.map((i) => [i.id, i]));
  const stock: StockImpactLine[] = consumptionLinesForEvent(db, householdId, ev).map((line) => {
    const have = onHand.get(line.ingredientId) ?? 0;
    const ing = ingById.get(line.ingredientId);
    return {
      ingredientId: line.ingredientId,
      ingredientName: ing?.name ?? "?",
      unit: ing?.unit ?? "",
      needed: line.amount,
      onHand: have,
      short: have < line.amount,
    };
  });

  // Macros: pull this event's meal out of the day's nutrition breakdown.
  const day = dayNutrition(db, householdId, ev.date);
  const meal = day.meals.find((m) => m.eventId === ev.id);
  const macros = {
    calories: Math.round(meal?.nutrients.calories ?? 0),
    proteinG: Math.round(meal?.nutrients.proteinG ?? 0),
    carbsG: Math.round(meal?.nutrients.carbsG ?? 0),
    fatG: Math.round(meal?.nutrients.fatG ?? 0),
  };

  return {
    event: {
      id: ev.id, date: ev.date, slotId: ev.slotId, slotName: slot?.name ?? "—",
      status: ev.status as "planned" | "cooked" | "served",
      cookedAhead: ev.cookedAhead, ruleId: ev.ruleId,
      servings: ev.servings, amount: ev.amount,
      recipeId: ev.recipeId, productId: ev.productId, ingredientId: ev.ingredientId, variantId: ev.variantId,
      name, variantName,
    },
    stock,
    macros,
    missing: meal?.missing ?? [],
  };
}
