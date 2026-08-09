// One-off FEFO backfill for the lot-tracking migration (drizzle/0032_add_lot_tracking.sql).
// Preserves current totals while giving every movement a lot (purchaseId):
//   1. Every positive `manual` movement with a product becomes its own `manual`
//      purchases lot (dated or undated); the movement is stamped to it.
//   2. Every outbound movement (`cooked` / `eaten` / negative `manual`) is
//      FEFO-attributed against that product's lots (soonest expiry first,
//      undated last, ties by oldest purchasedAt), splitting across lots as
//      needed. Overflow beyond total on-hand lands on the soonest-expiry lot
//      (goes negative), mirroring allocateFEFO's runtime overflow rule.
// Run: npx tsx scripts/migrate-lots.ts
import { db, schema } from "../src/db";
import { and, asc, eq, isNull, or, lt } from "drizzle-orm";

type Lot = { purchaseId: number; expiresAt: string | null; purchasedAt: number; remaining: number };

function fefoSort(a: Lot, b: Lot) {
  const ae = a.expiresAt ?? "9999-99-99";
  const be = b.expiresAt ?? "9999-99-99";
  if (ae !== be) return ae < be ? -1 : 1;
  return a.purchasedAt - b.purchasedAt;
}

function run() {
  // Snapshot pre-migration totals per product, to verify nothing is lost.
  const before = new Map<number, number>();
  for (const r of db.select({ productId: schema.stockMovements.productId, delta: schema.stockMovements.delta })
    .from(schema.stockMovements).all()) {
    if (r.productId == null) continue;
    before.set(r.productId, (before.get(r.productId) ?? 0) + r.delta);
  }

  // 1. Convert every positive manual movement (with a product) into its own lot.
  const allManual = db.select().from(schema.stockMovements)
    .where(eq(schema.stockMovements.reason, "manual")).all();
  const toLot = allManual.filter((m) => m.delta >= 0 && m.productId != null);

  let lotsCreated = 0;
  for (const m of toLot) {
    const [purchase] = db.insert(schema.purchases).values({
      householdId: m.householdId,
      productId: m.productId!,
      quantity: 1,
      cents: null,
      expiresAt: m.expiresAt,
      purchasedAt: m.at,
      manual: true,
    }).returning().all();
    db.update(schema.stockMovements).set({ purchaseId: purchase.id })
      .where(eq(schema.stockMovements.id, m.id)).run();
    lotsCreated++;
  }
  console.log(`Created ${lotsCreated} manual lots from positive manual movements.`);

  // 2. FEFO-attribute outbound movements per product.
  const productIds = db.selectDistinct({ productId: schema.stockMovements.productId })
    .from(schema.stockMovements)
    .where(and(
      or(eq(schema.stockMovements.reason, "cooked"), eq(schema.stockMovements.reason, "eaten"), eq(schema.stockMovements.reason, "manual")),
    )).all()
    .map((r) => r.productId)
    .filter((id): id is number => id != null);

  let movementsSplit = 0;
  let movementsAttributed = 0;

  for (const productId of [...new Set(productIds)]) {
    const purchaseRows = db.select().from(schema.purchases)
      .where(eq(schema.purchases.productId, productId)).all();
    if (purchaseRows.length === 0) continue; // no lot source for this product — nothing to attribute

    const lots: Lot[] = purchaseRows.map((p) => ({
      purchaseId: p.id, expiresAt: p.expiresAt, purchasedAt: +p.purchasedAt, remaining: 0,
    }));
    // remaining = sum of that lot's already-stamped movements (just the inbound one, so far)
    for (const lot of lots) {
      const rows = db.select({ delta: schema.stockMovements.delta }).from(schema.stockMovements)
        .where(eq(schema.stockMovements.purchaseId, lot.purchaseId)).all();
      lot.remaining = rows.reduce((s, r) => s + r.delta, 0);
    }
    lots.sort(fefoSort);

    const outbound = db.select().from(schema.stockMovements)
      .where(and(
        eq(schema.stockMovements.productId, productId),
        isNull(schema.stockMovements.purchaseId),
        or(
          eq(schema.stockMovements.reason, "cooked"),
          eq(schema.stockMovements.reason, "eaten"),
          and(eq(schema.stockMovements.reason, "manual"), lt(schema.stockMovements.delta, 0)),
        ),
      ))
      .orderBy(asc(schema.stockMovements.at), asc(schema.stockMovements.id))
      .all();

    for (const m of outbound) {
      let amountLeft = -m.delta; // positive amount to deplete
      const allocations: { purchaseId: number; delta: number }[] = [];

      for (const lot of lots) {
        if (amountLeft <= 0) break;
        if (lot.remaining <= 0) continue;
        const take = Math.min(amountLeft, lot.remaining);
        if (take <= 0) continue;
        allocations.push({ purchaseId: lot.purchaseId, delta: -take });
        lot.remaining -= take;
        amountLeft -= take;
      }
      if (amountLeft > 0) {
        // overflow beyond total on-hand: dump the rest on the soonest-expiry lot (negative)
        const soonest = lots[0];
        allocations.push({ purchaseId: soonest.purchaseId, delta: -amountLeft });
        soonest.remaining -= amountLeft;
        amountLeft = 0;
      }

      if (allocations.length === 0) continue; // shouldn't happen (lots.length > 0 guaranteed above)
      movementsAttributed++;
      if (allocations.length === 1) {
        db.update(schema.stockMovements)
          .set({ purchaseId: allocations[0].purchaseId })
          .where(eq(schema.stockMovements.id, m.id)).run();
      } else {
        movementsSplit++;
        // first allocation reuses the original row; the rest are new rows
        db.update(schema.stockMovements)
          .set({ purchaseId: allocations[0].purchaseId, delta: allocations[0].delta })
          .where(eq(schema.stockMovements.id, m.id)).run();
        for (const a of allocations.slice(1)) {
          db.insert(schema.stockMovements).values({
            householdId: m.householdId, ingredientId: m.ingredientId, productId: m.productId,
            variantId: m.variantId, delta: a.delta, reason: m.reason,
            mealEventId: m.mealEventId, purchaseId: a.purchaseId, at: m.at, expiresAt: m.expiresAt,
          }).run();
        }
      }
    }
  }
  console.log(`Attributed ${movementsAttributed} outbound movements (${movementsSplit} split across lots).`);

  // 3. Verify: per product, post-migration total == pre-migration total (no
  // delta lost across the split/update rewrites), and lot-grouped sum matches too.
  let pass = true;
  for (const [productId, beforeTotal] of before) {
    const rows = db.select({ delta: schema.stockMovements.delta, purchaseId: schema.stockMovements.purchaseId })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.productId, productId)).all();
    const afterTotal = rows.reduce((s, r) => s + r.delta, 0);
    const unattributed = rows.filter((r) => r.purchaseId == null).reduce((s, r) => s + r.delta, 0);
    if (afterTotal !== beforeTotal) {
      console.log(`FAIL product ${productId}: before ${beforeTotal} != after ${afterTotal}`);
      pass = false;
    }
    if (unattributed !== 0) {
      console.log(`NOTE product ${productId}: ${unattributed} units remain unattributed (legacy, no lot source)`);
      pass = false; // design requires Σ lot remaining == stockByProduct; flag any leftover
    }
  }
  console.log(pass ? "VERIFY: PASS — no delta lost, every product fully lot-attributed." : "VERIFY: FAIL — see above.");
}

run();
