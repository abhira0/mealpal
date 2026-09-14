/**
 * Read-only Platr query layer for the MCP server.
 *
 * Every function here wraps existing src/lib logic and returns plain JSON —
 * no mutations are imported, so there is no write path to get wrong. Shapes are
 * flattened and rounded for an LLM reader: whole numbers where precision is
 * noise, names instead of ids, goals folded in next to the numbers they judge.
 */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import {
  dayIngredientTable, dayNutrition, getGoals, macroSplit, mondayOf,
  recipeNutrition, weekNutrition,
} from "@/lib/nutrition";
import { agendaDays } from "@/lib/agenda";
import { expiryByIngredient, stockByIngredient } from "@/lib/stock";
import { runOutDates } from "@/lib/plan";
import { shoppingList } from "@/lib/shopping";
import { effectivePrice } from "@/lib/products";
import { getRecipe, listRecipes } from "@/lib/recipes";
import { listBatches } from "@/lib/batches";
import { localNoon, toISODate, todayISO } from "@/lib/dates";

type Db = BetterSQLite3Database<typeof schema>;

const r1 = (n: number | undefined) => Math.round((n ?? 0) * 10) / 10;
const r0 = (n: number | undefined) => Math.round(n ?? 0);

/**
 * The household to answer for. One household (the norm for a self-hosted
 * install) needs no configuration; PLATR_HOUSEHOLD_ID disambiguates when
 * there are several.
 */
export function resolveHousehold(db: Db, envId?: string): number {
  const rows = db.select({ id: schema.households.id, name: schema.households.name })
    .from(schema.households).all();
  if (envId) {
    const id = Number(envId);
    if (!rows.some((h) => h.id === id)) {
      throw new Error(`PLATR_HOUSEHOLD_ID=${envId} not found. Available: ${
        rows.map((h) => `${h.id} (${h.name})`).join(", ") || "none"}`);
    }
    return id;
  }
  if (rows.length === 1) return rows[0].id;
  if (rows.length === 0) throw new Error("No households in the database — is DATABASE_URL pointing at the right file?");
  throw new Error(`${rows.length} households found; set PLATR_HOUSEHOLD_ID to one of: ${
    rows.map((h) => `${h.id} (${h.name})`).join(", ")}`);
}

/** Totals + goals + how far off each macro is, the shape every caller wants. */
function vsGoals(db: Db, hid: number, t: {
  calories: number; proteinG: number; carbsG: number; fatG: number;
  satFatG: number; sodiumMg: number; fiberG: number; addedSugarG: number;
}, days = 1) {
  const g = getGoals(db, hid);
  const cmp = (actual: number, goal: number) => ({
    actual: r0(actual), goal: goal * days,
    delta: r0(actual - goal * days),
    pctOfGoal: goal ? r0((actual / (goal * days)) * 100) : null,
  });
  return {
    calories: cmp(t.calories, g.calorieGoal),
    proteinG: cmp(t.proteinG, g.proteinG),
    carbsG: cmp(t.carbsG, g.carbsG),
    fatG: cmp(t.fatG, g.fatG),
    // No user goal for these, but they're the ones that silently blow out.
    // Reference values are the standard daily limits, not Platr settings.
    satFatG: { actual: r1(t.satFatG), reference: 20 * days },
    sodiumMg: { actual: r0(t.sodiumMg), reference: 2300 * days },
    fiberG: { actual: r1(t.fiberG), reference: 28 * days },
    addedSugarG: { actual: r1(t.addedSugarG), reference: 50 * days },
  };
}

export function getDay(db: Db, hid: number, date?: string) {
  const d = date ?? todayISO();
  const day = dayNutrition(db, hid, d);
  return {
    date: d,
    // "planned" counts every meal on the day; "totals" only what's been eaten.
    totals: vsGoals(db, hid, day.total),
    ifAllPlannedEaten: vsGoals(db, hid, day.planned),
    macroSplitPct: macroSplit(day.total),
    meals: day.meals.map((m) => ({
      slot: m.slotName,
      name: m.recipeName,
      servings: r1(m.servings),
      eaten: !m.estimate,
      calories: r0(m.nutrients.calories),
      proteinG: r1(m.nutrients.proteinG),
      carbsG: r1(m.nutrients.carbsG),
      fatG: r1(m.nutrients.fatG),
      sodiumMg: r0(m.nutrients.sodiumMg),
      ...(m.missing.length ? { missingNutritionFor: m.missing } : {}),
    })),
    // Non-empty means totals UNDERCOUNT — these ingredients have no nutrition
    // facts entered, so say so rather than treating the numbers as complete.
    missingNutritionFor: day.missing,
  };
}

export function getDayIngredients(db: Db, hid: number, date?: string, sortBy = "calories") {
  const d = date ?? todayISO();
  const rows = dayIngredientTable(db, hid, d, "served");
  const key = sortBy as "calories" | "fatG" | "proteinG" | "carbsG" | "sodiumMg";
  return {
    date: d,
    sortedBy: key,
    ingredients: rows
      .map((row) => ({
        ingredient: row.name,
        product: row.productName,
        qty: r1(row.qty),
        unit: row.unit,
        calories: r0(row.values.calories),
        proteinG: r1(row.values.proteinG),
        carbsG: r1(row.values.carbsG),
        fatG: r1(row.values.fatG),
        satFatG: r1(row.values.satFatG),
        sodiumMg: r0(row.values.sodiumMg),
      }))
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)),
  };
}

export function getWeek(db: Db, hid: number, date?: string) {
  const monday = mondayOf(date ?? todayISO());
  const week = weekNutrition(db, hid, monday);
  return {
    weekOf: monday,
    daysWithMeals: week.daysWithMeals,
    // Averaged over days that actually have meals, so a partial week isn't
    // dragged down by days that haven't happened yet. Compare to the DAILY goal.
    dailyAverage: vsGoals(db, hid, week.average),
    byDay: week.perDay.map((d) => ({
      date: d.date,
      hasMeals: d.hasMeals,
      calories: r0(d.total.calories),
      proteinG: r1(d.total.proteinG),
      carbsG: r1(d.total.carbsG),
      fatG: r1(d.total.fatG),
    })),
    missingNutritionFor: week.missing,
  };
}

export function getAgenda(db: Db, hid: number, from?: string, days = 7) {
  const start = from ?? todayISO();
  // localNoon, not Date.parse: parsing a bare date gives UTC midnight, which
  // rolls back a day once toISODate renders it in a negative-offset timezone.
  const end = toISODate(new Date(localNoon(start).getTime() + (Math.max(1, days) - 1) * 86_400_000));
  return {
    from: start, to: end,
    days: agendaDays(db, hid, start, end, todayISO()).map((d) => ({
      date: d.date,
      eaten: `${d.eatenCount}/${d.totalCount}`,
      meals: d.meals.map((m) => ({
        slot: m.slotName,
        name: m.name,
        status: m.phase,
        fromBatch: m.batchBacked ? { batchId: m.batchId, servingsLeft: m.mealsRemaining } : null,
        ...(m.outOfStock ? { outOfStock: true, missingItems: m.missingItems } : {}),
      })),
      // A batch runs dry on this date — cook before then or the plan breaks.
      cookNeeded: d.cookFlags.map((c) => `${c.slotName}: ${c.label}`),
    })),
    batches: listBatches(db, hid).map((b) => ({
      id: b.id, label: b.label, cookedDate: b.cookedDate,
      servingsLeft: b.mealsRemaining, servingsTotal: b.mealsTotal,
    })),
  };
}

export function getStock(db: Db, hid: number, includeZero = false) {
  const today = todayISO();
  const horizon = toISODate(new Date(Date.now() + 30 * 86_400_000));
  const stock = stockByIngredient(db, hid);
  const expiry = expiryByIngredient(db, hid);
  const runOut = runOutDates(db, hid, today, horizon, stock, expiry);
  const names = new Map(db.select().from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, hid)).all()
    .map((i) => [i.id, { name: i.name, unit: i.canonicalUnit }]));

  // stockByIngredient only has ingredients with movements, so an ingredient
  // that was never bought is absent rather than zero — union in the rest.
  const entries = includeZero
    ? [...names.keys()].map((id) => [id, stock.get(id) ?? 0] as const)
    : [...stock];

  return {
    asOf: today,
    items: entries
      .filter(([, qty]) => includeZero || qty > 0)
      .map(([id, qty]) => ({
        ingredient: names.get(id)?.name ?? "?",
        qty: r1(qty),
        unit: names.get(id)?.unit ?? "",
        expiresOn: expiry.get(id) ?? null,
        // Date the plan burns through it; absent = lasts past the 30d horizon.
        runsOutOn: runOut.get(id) ?? null,
      }))
      .sort((a, b) => (a.runsOutOn ?? "9999").localeCompare(b.runsOutOn ?? "9999")),
  };
}

export function getShopping(db: Db, hid: number, horizonDays = 14) {
  const grouped = shoppingList(db, hid, horizonDays);
  let knownTotalCents = 0;
  let allPriced = true;
  const byShop = [...grouped].map(([shop, lines]) => {
    let shopCents = 0;
    let shopAllPriced = true;
    const outLines = lines.map((l) => {
      const x = l as typeof l & { urgency?: string | null; extraId?: number };
      // Estimated cost: packs needed (rounded up to whole packs, min 1 if
      // buying at all) times the product's effective price. null when there's
      // no product on file or no price has ever been recorded for it.
      const packSize = l.product?.packSize ?? null;
      const price = l.product ? effectivePrice(db, l.product.id) : null;
      const estCents = price != null && packSize && packSize > 0
        ? Math.round(Math.max(1, Math.ceil(l.needed / packSize)) * price)
        : null;
      if (estCents != null) shopCents += estCents; else shopAllPriced = false;
      return {
        item: l.ingredientName,
        needed: r1(l.needed),
        product: l.product?.name ?? null,
        packSize,
        estCents,
        urgency: x.urgency ?? null,
        manuallyAdded: x.extraId != null,
      };
    });
    if (shopAllPriced) knownTotalCents += shopCents; else allPriced = false;
    return {
      shop,
      // Sum of estCents for priced lines only — a partial total, not the whole trip.
      estCents: shopCents > 0 ? shopCents : null,
      lines: outLines,
    };
  });
  return {
    horizonDays,
    byShop,
    // Whole-trip estimate, only when every line across every shop has a price
    // on file — otherwise it would understate the real cost, which is worse
    // than saying nothing.
    estTotalCents: allPriced && knownTotalCents > 0 ? knownTotalCents : null,
  };
}

export function findRecipe(db: Db, hid: number, query: string) {
  const all = listRecipes(db, hid);
  const q = query.trim().toLowerCase();
  const exact = all.filter((r) => r.name.toLowerCase() === q);
  const matches = exact.length ? exact : all.filter((r) => r.name.toLowerCase().includes(q));

  if (matches.length === 0) {
    return {
      found: false,
      query,
      // Give the model something to retry with instead of a dead end.
      availableRecipes: all.map((r) => r.name),
    };
  }
  if (matches.length > 1) {
    return { found: false, query, ambiguous: matches.map((r) => r.name) };
  }

  const recipe = getRecipe(db, hid, matches[0].id);
  if (!recipe) return { found: false, query, availableRecipes: all.map((r) => r.name) };
  const n = recipeNutrition(db, hid, recipe);
  return {
    found: true,
    name: recipe.name,
    baseServings: recipe.baseServings,
    totalMinutes: recipe.totalMinutes ?? null,
    notes: recipe.notes ?? null,
    perServing: {
      calories: r0(n.perServing.calories),
      proteinG: r1(n.perServing.proteinG),
      carbsG: r1(n.perServing.carbsG),
      fatG: r1(n.perServing.fatG),
      sodiumMg: r0(n.perServing.sodiumMg),
    },
    ingredients: n.byIngredient.map((i) => ({
      name: i.name,
      amountPerServing: r1(i.amount),
      unit: i.unit,
      calories: r0(i.values.calories),
      fatG: r1(i.values.fatG),
      carbsG: r1(i.values.carbsG),
      proteinG: r1(i.values.proteinG),
    })),
    steps: recipe.steps.map((s) => s.text),
    // Totals undercount by these — don't present them as complete.
    missingNutritionFor: n.missing,
  };
}
