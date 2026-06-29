import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import type { DeleteResult } from "@/lib/shops";
import { currentStock } from "@/lib/stock";

type Db = BetterSQLite3Database<typeof schema>;

export interface IngredientInput {
  name: string;
  canonicalUnit: string;
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
  const ingredients = db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId))
    .all();

  // Image = the top-priority product's image. Scan products priority-ascending
  // and keep the first one seen per ingredient.
  const products = db
    .select({
      ingredientId: schema.products.ingredientId,
      imageUrl: schema.products.imageUrl,
    })
    .from(schema.products)
    .where(eq(schema.products.householdId, householdId))
    .orderBy(asc(schema.products.priority))
    .all();
  const imageByIngredient = new Map<number, string | null>();
  for (const p of products) {
    if (!imageByIngredient.has(p.ingredientId)) {
      imageByIngredient.set(p.ingredientId, p.imageUrl);
    }
  }

  return ingredients.map((ing) => ({
    ...ing,
    imageUrl: imageByIngredient.get(ing.id) ?? null,
    stock: currentStock(db, householdId, ing.id), // ponytail: one query per ingredient, household scale
  }));
}

/**
 * Everything the ingredient detail page needs in one bundle: the ingredient,
 * stock on hand, its products in preference order (each with shop, effective
 * price, history and cost-per-canonical-unit), and the recipes that use it.
 * Household-scale, not a hot path — a few small queries grouped in JS.
 */
export function ingredientDetail(db: Db, householdId: number, id: number) {
  const [ingredient] = db
    .select()
    .from(schema.ingredients)
    .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.householdId, householdId)))
    .all();
  if (!ingredient) return null;

  const products = db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      shopId: schema.products.shopId,
      shopName: schema.shops.name,
      shopWebsite: schema.shops.website,
      shopIconUrl: schema.shops.iconUrl,
      packSize: schema.products.packSize,
      priority: schema.products.priority,
      priceCents: schema.products.priceCents,
      available: schema.products.available,
      url: schema.products.url,
      imageUrl: schema.products.imageUrl,
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .where(and(eq(schema.products.householdId, householdId), eq(schema.products.ingredientId, id)))
    .orderBy(asc(schema.products.priority))
    .all();

  const purchases = db
    .select({ productId: schema.purchases.productId, cents: schema.purchases.cents, purchasedAt: schema.purchases.purchasedAt })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.householdId, householdId), isNotNull(schema.purchases.cents)))
    .orderBy(desc(schema.purchases.purchasedAt))
    .all();
  const historyByProduct = new Map<number, { cents: number; purchasedAt: Date }[]>();
  for (const p of purchases) {
    if (p.cents == null) continue; // defensive; query already filters these out
    const list = historyByProduct.get(p.productId) ?? [];
    list.push({ cents: p.cents, purchasedAt: p.purchasedAt });
    historyByProduct.set(p.productId, list);
  }

  const recipes = db
    .select({ id: schema.recipes.id, name: schema.recipes.name })
    .from(schema.recipeIngredients)
    .innerJoin(schema.recipes, eq(schema.recipeIngredients.recipeId, schema.recipes.id))
    .where(and(eq(schema.recipes.householdId, householdId), eq(schema.recipeIngredients.ingredientId, id)))
    .all();

  return {
    ...ingredient,
    stock: currentStock(db, householdId, id),
    products: products.map((p) => {
      const history = historyByProduct.get(p.id) ?? [];
      const effectiveCents = p.priceCents ?? history[0]?.cents ?? null;
      // cost per canonical unit, in cents — the cross-product comparator
      const costPerUnit = effectiveCents != null && p.packSize > 0 ? effectiveCents / p.packSize : null;
      return { ...p, history, effectiveCents, costPerUnit };
    }),
    recipes,
  };
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
