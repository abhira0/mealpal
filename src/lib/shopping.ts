import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { expiryByIngredient, stockByIngredient } from "@/lib/stock";
import { plannedConsumption, runOutDates } from "@/lib/plan";
import { toISODate, todayISO } from "@/lib/dates";

type Db = BetterSQLite3Database<typeof schema>;

// cents null = bought but not yet priced; fill it in later on the bill screen.
// purchasedAt omitted = now; set it to backfill a past purchase from the history tab.
export interface PurchaseInput { productId: number; quantity: number; cents?: number | null; expiresAt?: string | null; purchasedAt?: Date | null; shopId?: number | null; manual?: boolean; }

/** Record a purchase: insert purchase row and restock inventory. The purchase IS the price history. */
export function recordPurchase(db: Db, householdId: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const [product] = tx.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
    if (input.shopId != null) {
      const [shop] = tx.select().from(schema.shops)
        .where(and(eq(schema.shops.id, input.shopId), eq(schema.shops.householdId, householdId))).all();
      if (!shop) throw new Error("shop not found in household");
    }
    const [purchase] = tx.insert(schema.purchases)
      .values({ householdId, productId: input.productId, quantity: input.quantity, cents: input.cents ?? null, expiresAt: input.expiresAt ?? null, shopId: input.shopId ?? null, manual: input.manual ?? false, ...(input.purchasedAt ? { purchasedAt: input.purchasedAt } : {}) })
      .returning().all();
    tx.insert(schema.stockMovements).values({
      householdId, ingredientId: product.ingredientId, productId: product.id,
      delta: product.packSize * input.quantity, reason: "purchase", purchaseId: purchase.id,
    }).run();
    return purchase;
  });
}

/** Pending purchases (no price yet), newest first, with product name + a price hint. */
export function listPendingPurchases(db: Db, householdId: number) {
  return db.select({
    id: schema.purchases.id,
    productId: schema.purchases.productId,
    ingredientId: schema.products.ingredientId,
    productName: schema.products.name,
    shopId: sql<number>`coalesce(${schema.purchases.shopId}, ${schema.products.shopId})`,
    shopName: schema.shops.name,
    website: schema.shops.website,
    iconUrl: schema.shops.iconUrl,
    quantity: schema.purchases.quantity,
    expiresAt: schema.purchases.expiresAt,
    hintCents: schema.products.priceCents, // manual override as a suggestion; may be null
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    // purchase's shop override wins; otherwise the product's usual shop
    .innerJoin(schema.shops, eq(schema.shops.id, sql`coalesce(${schema.purchases.shopId}, ${schema.products.shopId})`))
    .where(and(eq(schema.purchases.householdId, householdId), isNull(schema.purchases.cents), eq(schema.purchases.manual, false)))
    .orderBy(desc(schema.purchases.purchasedAt))
    .all();
}

/** Full purchase history, newest first. Same shape as pending, but seeded with
 *  the price actually paid (so the bill row prefills it) and every row, priced or not.
 *  Paginated via limit/offset for the history tab's infinite scroll. */
export function listPurchaseHistory(db: Db, householdId: number, opts: { limit?: number; offset?: number } = {}) {
  const q = db.select({
    id: schema.purchases.id,
    productId: schema.purchases.productId,
    ingredientId: schema.products.ingredientId,
    productName: schema.products.name,
    shopId: sql<number>`coalesce(${schema.purchases.shopId}, ${schema.products.shopId})`,
    shopName: schema.shops.name,
    website: schema.shops.website,
    iconUrl: schema.shops.iconUrl,
    quantity: schema.purchases.quantity,
    expiresAt: schema.purchases.expiresAt,
    hintCents: schema.purchases.cents, // what was actually paid, prefilled for editing
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    // purchase's shop override wins; otherwise the product's usual shop
    .innerJoin(schema.shops, eq(schema.shops.id, sql`coalesce(${schema.purchases.shopId}, ${schema.products.shopId})`))
    .where(and(eq(schema.purchases.householdId, householdId), eq(schema.purchases.manual, false)))
    // id tiebreaker: purchasedAt ties (backfills share local noon) would make
    // limit/offset page boundaries nondeterministic.
    .orderBy(desc(schema.purchases.purchasedAt), desc(schema.purchases.id))
    .$dynamic();
  if (opts.limit != null) q.limit(opts.limit);
  if (opts.offset != null) q.offset(opts.offset);
  return q.all();
}

/**
 * Fill in / correct a purchase. Changing quantity re-syncs the linked restock
 * movement's delta so inventory stays consistent. Household-scoped.
 */
export function updatePurchase(
  db: Db, householdId: number, id: number,
  patch: { cents?: number | null; expiresAt?: string | null; quantity?: number; productId?: number; shopId?: number | null; purchasedAt?: Date },
) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return undefined;

    if (patch.shopId != null) {
      const [shop] = tx.select().from(schema.shops)
        .where(and(eq(schema.shops.id, patch.shopId), eq(schema.shops.householdId, householdId))).all();
      if (!shop) throw new Error("shop not found in household");
    }

    // Swapping the product (e.g. the milk you wanted was out, you grabbed another)
    // or changing quantity re-points/re-sizes the linked restock so stock stays right.
    const newProductId = patch.productId ?? purchase.productId;
    const quantity = patch.quantity ?? purchase.quantity;
    if (patch.productId !== undefined || (patch.quantity !== undefined && patch.quantity !== purchase.quantity)) {
      const [product] = tx.select().from(schema.products)
        .where(and(eq(schema.products.id, newProductId), eq(schema.products.householdId, householdId))).all();
      if (!product) throw new Error("product not found in household");
      tx.update(schema.stockMovements)
        .set({ productId: product.id, ingredientId: product.ingredientId, delta: product.packSize * quantity })
        .where(and(eq(schema.stockMovements.purchaseId, id), eq(schema.stockMovements.reason, "purchase"))).run();
    }

    const [row] = tx.update(schema.purchases)
      .set({
        ...(patch.cents !== undefined ? { cents: patch.cents } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
        ...(patch.shopId !== undefined ? { shopId: patch.shopId } : {}),
        ...(patch.purchasedAt !== undefined ? { purchasedAt: patch.purchasedAt } : {}),
      })
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId)))
      .returning().all();
    return row;
  });
}

/** Undo a purchase: drop its restock movement and the purchase row. Household-scoped. */
export function deletePurchase(db: Db, householdId: number, id: number) {
  return db.transaction((tx) => {
    const [purchase] = tx.select().from(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).all();
    if (!purchase) return false;
    tx.delete(schema.stockMovements).where(eq(schema.stockMovements.purchaseId, id)).run();
    tx.delete(schema.purchases)
      .where(and(eq(schema.purchases.id, id), eq(schema.purchases.householdId, householdId))).run();
    return true;
  });
}

/**
 * Per-ingredient shelf life in days, learned from purchase history:
 * median(expiresAt − purchasedAt) over that ingredient's dated purchases.
 * Only ingredients with ≥2 dated purchases are included; callers fall back to
 * the horizon for the rest. Pooled across all products of the ingredient.
 */
export function learnedShelfLife(db: Db, householdId: number): Map<number, number> {
  const rows = db.select({
    ingredientId: schema.products.ingredientId,
    expiresAt: schema.purchases.expiresAt,
    purchasedAt: schema.purchases.purchasedAt,
  })
    .from(schema.purchases)
    .innerJoin(schema.products, eq(schema.products.id, schema.purchases.productId))
    .where(and(eq(schema.purchases.householdId, householdId), eq(schema.purchases.manual, false)))
    .all();

  const daysByIngredient = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.expiresAt) continue;
    // Floor purchasedAt to its UTC calendar day before diffing — expiresAt is
    // a bare date string (Date.parse reads it as UTC midnight), so leaving
    // purchasedAt's time-of-day in the subtraction shorts (or zeroes) the
    // learned shelf life depending what time of day the purchase happened.
    const purchaseDay = Date.UTC(
      r.purchasedAt.getUTCFullYear(), r.purchasedAt.getUTCMonth(), r.purchasedAt.getUTCDate(),
    );
    const days = Math.round((Date.parse(r.expiresAt) - purchaseDay) / 86_400_000);
    if (days <= 0) continue; // ignore already-expired / same-day junk
    const list = daysByIngredient.get(r.ingredientId) ?? [];
    list.push(days);
    daysByIngredient.set(r.ingredientId, list);
  }

  const result = new Map<number, number>();
  for (const [ingredientId, days] of daysByIngredient) {
    if (days.length < 2) continue; // not enough data to trust
    days.sort((a, b) => a - b);
    const mid = Math.floor(days.length / 2);
    const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
    result.set(ingredientId, median);
  }
  return result;
}

/**
 * Chip for a shopping line: how soon and why. When the run-out was forced by
 * expiry (expiry precedes the run-out meal), count down to the expiry date —
 * "expires in 2d" reads truer than "out in 3d" for a full-but-dying pack.
 */
export function urgency(runOut: string | undefined, expiresAt: string | undefined, from: string) {
  if (!runOut) return null;
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(from)) / 86_400_000);
  const rel = (d: number) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d}d`);
  if (expiresAt && expiresAt < runOut) {
    const d = days(expiresAt);
    return { label: `expires ${rel(d)}`, tone: d <= 3 ? ("run" as const) : ("low" as const) };
  }
  const daysOut = days(runOut);
  return { label: `out ${rel(daysOut)}`, tone: daysOut <= 3 ? ("run" as const) : ("low" as const) };
}

/** Add a manual line: a tracked product OR a one-off free-text title. */
export function addExtra(
  db: Db, householdId: number,
  input: { productId?: number | null; title?: string | null; shopId?: number | null; quantity?: number },
) {
  if (input.shopId != null) {
    const [shop] = db.select().from(schema.shops)
      .where(and(eq(schema.shops.id, input.shopId), eq(schema.shops.householdId, householdId))).all();
    if (!shop) throw new Error("shop not found in household");
  }
  if (input.productId != null) {
    const [product] = db.select().from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    if (!product) throw new Error("product not found in household");
  }
  const [row] = db.insert(schema.shoppingExtras)
    .values({
      householdId,
      productId: input.productId ?? null,
      title: input.title?.trim() || null,
      shopId: input.shopId ?? null,
      quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    })
    .returning().all();
  return row;
}

/** Manual lines for the run, with the shop they belong to (product's shop, else explicit, else null). */
export function listExtras(db: Db, householdId: number) {
  return db.select({
    id: schema.shoppingExtras.id,
    title: schema.shoppingExtras.title,
    quantity: schema.shoppingExtras.quantity,
    productId: schema.products.id,
    productName: schema.products.name,
    // product's shop wins; otherwise the explicitly chosen shop
    shopName: schema.shops.name,
  })
    .from(schema.shoppingExtras)
    .leftJoin(schema.products, eq(schema.products.id, schema.shoppingExtras.productId))
    .leftJoin(
      schema.shops,
      eq(schema.shops.id, sql`coalesce(${schema.products.shopId}, ${schema.shoppingExtras.shopId})`),
    )
    .where(eq(schema.shoppingExtras.householdId, householdId))
    .all();
}

export function deleteExtra(db: Db, householdId: number, id: number) {
  const res = db.delete(schema.shoppingExtras)
    .where(and(eq(schema.shoppingExtras.id, id), eq(schema.shoppingExtras.householdId, householdId)))
    .run();
  return res.changes > 0;
}

export interface ShoppingLine {
  ingredientId: number; ingredientName: string;
  needed: number;        // canonical units short
  product: { id: number; name: string; packSize: number } | null; // top-priority available product
}

/**
 * For each ingredient short of `targetByIngredient`, pick the top-priority AVAILABLE
 * product and group the resulting lines by shop. Returns a shop -> lines map.
 */
export function buyRecommendation(
  db: Db, householdId: number,
  stockByIngredientMap: Map<number, number>,
  targetByIngredient: Map<number, number>,
): Map<string, ShoppingLine[]> {
  const result = new Map<string, ShoppingLine[]>();
  const ingredientRows = db.select().from(schema.ingredients)
    .where(eq(schema.ingredients.householdId, householdId)).all();
  const nameById = new Map(ingredientRows.map((i) => [i.id, i.name]));

  for (const [ingredientId, target] of targetByIngredient) {
    const have = stockByIngredientMap.get(ingredientId) ?? 0;
    const needed = target - have;
    if (needed <= 0) continue;
    const [product] = db.select().from(schema.products)
      .where(and(
        eq(schema.products.householdId, householdId),
        eq(schema.products.ingredientId, ingredientId),
        eq(schema.products.available, true),
      ))
      .orderBy(asc(schema.products.priority)).limit(1).all();
    const shop = product
      ? db.select().from(schema.shops).where(eq(schema.shops.id, product.shopId)).all()[0]
      : null;
    const shopKey = shop?.name ?? "Unassigned";
    const line: ShoppingLine = {
      ingredientId, ingredientName: nameById.get(ingredientId) ?? "?",
      needed, product: product ? { id: product.id, name: product.name, packSize: product.packSize } : null,
    };
    if (!result.has(shopKey)) result.set(shopKey, []);
    result.get(shopKey)!.push(line);
  }
  return result;
}

/**
 * The full shopping list: buy recommendations over `horizon` days, spoilage-
 * adjusted and urgency-tagged, plus manually-added extras — grouped by shop.
 *
 * Extracted from the /api/shopping route so the MCP server and the web app
 * return the same list; the route is now a thin auth + JSON wrapper.
 */
export function shoppingList(db: Db, householdId: number, horizon = 14) {
  const days = Math.min(90, Math.max(1, horizon));
  const from = todayISO();
  const to = toISODate(new Date(Date.now() + days * 86_400_000));
  const stock = stockByIngredient(db, householdId);
  const target = plannedConsumption(db, householdId, from, to, learnedShelfLife(db, householdId));
  // Stock past its expiry date is spoiled: only what the plan consumes before
  // expiry counts, so replacements show up as soon as expiry (not depletion) demands.
  // Past dates are dropped — expiryByIngredient mins over ALL purchases ever, and a
  // long-consumed pack's old date must not zero out the fresh stock on hand.
  const expiry = new Map([...expiryByIngredient(db, householdId)].filter(([, d]) => d >= from));
  const expiryDays = new Map([...expiry].map(([id, d]) =>
    [id, Math.round((Date.parse(d) - Date.parse(from)) / 86_400_000)] as const));
  const useBeforeExpiry = plannedConsumption(db, householdId, from, to, expiryDays);
  const usable = new Map(stock);
  for (const [id] of expiryDays)
    usable.set(id, Math.min(stock.get(id) ?? 0, useBeforeExpiry.get(id) ?? 0));
  const grouped = buyRecommendation(db, householdId, usable, target);
  const runOut = runOutDates(db, householdId, from, to, stock, expiry);
  for (const lines of grouped.values())
    for (const line of lines)
      (line as typeof line & { urgency?: unknown }).urgency =
        urgency(runOut.get(line.ingredientId), expiry.get(line.ingredientId), from);

  // Fold in manually-added lines. extraId marks them so the UI deletes (not "buys") them.
  for (const e of listExtras(db, householdId)) {
    const shopKey = e.shopName ?? "Unassigned";
    if (!grouped.has(shopKey)) grouped.set(shopKey, []);
    grouped.get(shopKey)!.push({
      ingredientId: 0,
      ingredientName: e.title ?? e.productName ?? "Item",
      needed: e.quantity,
      product: e.productId ? { id: e.productId, name: e.productName ?? "" } : null,
      extraId: e.id,
      urgency: null,
    } as never);
  }

  // Most time-sensitive first within each shop, so the items you can't put
  // off surface at the top of the list instead of wherever the map iterated.
  const rank = { run: 0, low: 1 } as Record<string, number>;
  for (const lines of grouped.values())
    lines.sort((a, b) =>
      (rank[(a as { urgency?: { tone?: string } | null }).urgency?.tone ?? ""] ?? 2) -
      (rank[(b as { urgency?: { tone?: string } | null }).urgency?.tone ?? ""] ?? 2));

  return grouped;
}
