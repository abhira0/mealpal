import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

/** Result of a delete that may be blocked by rows referencing it. */
export type DeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: string };

export function createShop(
  db: Db,
  householdId: number,
  name: string,
  website?: string | null,
  iconUrl?: string | null,
) {
  const [row] = db
    .insert(schema.shops)
    .values({ householdId, name, website: website ?? null, iconUrl: iconUrl ?? null })
    .returning()
    .all();
  return row;
}

// Alphabetical: as the shop list grows, insertion order (the previous
// behavior) makes both the manage page and every shop picker (AddExtra,
// product editor) harder to scan than a stable, predictable A-Z order.
export function listShops(db: Db, householdId: number) {
  return db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.householdId, householdId))
    .orderBy(asc(schema.shops.name))
    .all();
}

export interface ShopPatch {
  name?: string;
  website?: string | null;
  iconUrl?: string | null;
}

export function updateShop(db: Db, householdId: number, id: number, patch: ShopPatch) {
  const [row] = db
    .update(schema.shops)
    .set(patch)
    .where(and(eq(schema.shops.id, id), eq(schema.shops.householdId, householdId)))
    .returning()
    .all();
  return row; // undefined if no row matched the household scope
}

export function deleteShop(db: Db, householdId: number, id: number): DeleteResult {
  const productCount = db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.householdId, householdId), eq(schema.products.shopId, id)))
    .all().length;
  if (productCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${productCount} ${productCount === 1 ? "product" : "products"} use this shop.`,
    };
  }
  // purchases.shopId and shoppingExtras.shopId are optional per-row overrides
  // (independent of the product's default shop) and both FK-reference shops.id
  // with foreign_keys=ON, so an unchecked delete throws a raw SqliteError
  // instead of the friendly message above.
  const purchaseCount = db
    .select()
    .from(schema.purchases)
    .where(and(eq(schema.purchases.householdId, householdId), eq(schema.purchases.shopId, id)))
    .all().length;
  if (purchaseCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${purchaseCount} ${purchaseCount === 1 ? "purchase" : "purchases"} reference this shop.`,
    };
  }
  const extraCount = db
    .select()
    .from(schema.shoppingExtras)
    .where(and(eq(schema.shoppingExtras.householdId, householdId), eq(schema.shoppingExtras.shopId, id)))
    .all().length;
  if (extraCount > 0) {
    return {
      ok: false,
      reason: `Can't delete: ${extraCount} shopping list ${extraCount === 1 ? "item" : "items"} reference this shop.`,
    };
  }
  const rows = db
    .delete(schema.shops)
    .where(and(eq(schema.shops.id, id), eq(schema.shops.householdId, householdId)))
    .returning()
    .all();
  return { ok: true, deleted: rows.length > 0 };
}
