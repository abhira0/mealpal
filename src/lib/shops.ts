import { and, eq } from "drizzle-orm";
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

export function listShops(db: Db, householdId: number) {
  return db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.householdId, householdId))
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
  const rows = db
    .delete(schema.shops)
    .where(and(eq(schema.shops.id, id), eq(schema.shops.householdId, householdId)))
    .returning()
    .all();
  return { ok: true, deleted: rows.length > 0 };
}
