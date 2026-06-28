import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

export function createShop(db: Db, householdId: number, name: string) {
  const [row] = db
    .insert(schema.shops)
    .values({ householdId, name })
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

export function createBranch(
  db: Db,
  householdId: number,
  shopId: number,
  name: string,
) {
  const [row] = db
    .insert(schema.branches)
    .values({ householdId, shopId, name })
    .returning()
    .all();
  return row;
}

export function listBranches(db: Db, householdId: number, shopId: number) {
  return db
    .select()
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.householdId, householdId),
        eq(schema.branches.shopId, shopId),
      ),
    )
    .all();
}
