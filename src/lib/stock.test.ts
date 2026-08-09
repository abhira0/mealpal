import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import {
  recordMovement, currentStock, stockByIngredient, expiryByIngredient,
  lotsByProduct, allocateFEFO, adjustStock, stockByProduct,
} from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
});

describe("stock ledger", () => {
  it("sums signed deltas into current stock", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 1000, reason: "purchase" });
    recordMovement(db, hid, { ingredientId: flourId, delta: -300, reason: "cooked" });
    expect(currentStock(db, hid, flourId)).toBe(700);
  });
  it("returns 0 for an ingredient with no movements", () => {
    expect(currentStock(db, hid, flourId)).toBe(0);
  });
  it("reports stock for every ingredient with movements, scoped to household", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual" });
    const map = stockByIngredient(db, hid);
    expect(map.get(flourId)).toBe(500);
  });
  it("surfaces the soonest expiry among positive movements, ignoring null/consumption", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-10" });
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-03" });
    recordMovement(db, hid, { ingredientId: flourId, delta: -200, reason: "cooked", expiresAt: null });
    expect(expiryByIngredient(db, hid).get(flourId)).toBe("2026-07-03");
  });
  it("takes the earliest expiry across manual and purchase sources", () => {
    recordMovement(db, hid, { ingredientId: flourId, delta: 500, reason: "manual", expiresAt: "2026-07-10" });
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 1kg", packSize: 1000 })
      .returning().all()[0].id;
    const purchaseId = db.insert(schema.purchases)
      .values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-07-05" }).returning().all()[0].id;
    // A real buy also restocks — that's the lot with units on hand.
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1000, reason: "purchase", purchaseId });
    expect(expiryByIngredient(db, hid).get(flourId)).toBe("2026-07-05");
  });
  it("ignores a fully-consumed lot's expiry, keeping the live lot's date", () => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 1kg", packSize: 1000 })
      .returning().all()[0].id;
    // Old lot expiring 07-03, fully eaten. New lot expiring 08-19, on hand.
    const oldLot = db.insert(schema.purchases)
      .values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-07-03" }).returning().all()[0].id;
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1000, reason: "purchase", purchaseId: oldLot });
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: -1000, reason: "cooked", purchaseId: oldLot });
    const newLot = db.insert(schema.purchases)
      .values({ householdId: hid, productId, quantity: 1, expiresAt: "2026-08-19" }).returning().all()[0].id;
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 1000, reason: "purchase", purchaseId: newLot });
    expect(expiryByIngredient(db, hid).get(flourId)).toBe("2026-08-19");
  });
});

describe("lotsByProduct / allocateFEFO / adjustStock (per-lot FEFO tracking)", () => {
  let shopId: number;
  let productId: number;
  beforeEach(() => {
    shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 1kg", packSize: 1000 })
      .returning().all()[0].id;
  });

  const buyLot = (qty: number, expiresAt: string | null, cents: number | null = 200) => {
    const [purchase] = db.insert(schema.purchases)
      .values({ householdId: hid, productId, quantity: 1, cents, expiresAt, manual: false })
      .returning().all();
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: qty, reason: "purchase", purchaseId: purchase.id });
    return purchase.id;
  };

  it("orders lots soonest-expiry first, undated last, and computes remaining per lot", () => {
    const late = buyLot(500, "2026-08-20");
    const undated = buyLot(300, null);
    const soon = buyLot(400, "2026-07-10");
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: -100, reason: "cooked", purchaseId: soon });

    const lots = lotsByProduct(db, hid).get(productId)!;
    expect(lots.map((l) => l.purchaseId)).toEqual([soon, late, undated]);
    expect(lots.find((l) => l.purchaseId === soon)!.remaining).toBe(300);
    expect(lots.find((l) => l.purchaseId === late)!.remaining).toBe(500);
    expect(lots.find((l) => l.purchaseId === undated)!.remaining).toBe(300);
  });

  it("drops zero-remaining lots but keeps negative ones; Σ lots == stockByProduct", () => {
    const drained = buyLot(200, "2026-07-01");
    const negative = buyLot(100, "2026-07-05");
    buyLot(50, "2026-07-15");
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: -200, reason: "cooked", purchaseId: drained });
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: -150, reason: "cooked", purchaseId: negative });

    const lots = lotsByProduct(db, hid).get(productId)!;
    expect(lots.some((l) => l.purchaseId === drained)).toBe(false); // 0 remaining, dropped
    const neg = lots.find((l) => l.purchaseId === negative)!;
    expect(neg.remaining).toBe(-50); // kept, negative
    const total = lots.reduce((s, l) => s + l.remaining, 0);
    expect(total).toBe(stockByProduct(db, hid).get(productId));
  });

  it("allocateFEFO splits a single deplete across two lots, soonest first", () => {
    const soon = buyLot(100, "2026-07-01");
    const later = buyLot(200, "2026-08-01");
    const moves = allocateFEFO(db, hid, flourId, productId, 150, { reason: "cooked" });
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ purchaseId: soon, delta: -100 });
    expect(moves[1]).toMatchObject({ purchaseId: later, delta: -50 });
    expect(stockByProduct(db, hid).get(productId)).toBe(150);
  });

  it("allocateFEFO overflow beyond on-hand drives the soonest lot negative", () => {
    const soon = buyLot(50, "2026-07-01");
    const moves = allocateFEFO(db, hid, flourId, productId, 80, { reason: "cooked" });
    expect(moves).toHaveLength(2);
    expect(moves[1]).toMatchObject({ purchaseId: soon, delta: -30 });
    const lots = lotsByProduct(db, hid).get(productId)!;
    expect(lots.find((l) => l.purchaseId === soon)!.remaining).toBe(-30);
  });

  it("allocateFEFO with no lots at all falls back to one unattributed negative movement", () => {
    const moves = allocateFEFO(db, hid, flourId, productId, 40, { reason: "cooked" });
    expect(moves).toHaveLength(1);
    expect(moves[0].purchaseId).toBeNull();
    expect(moves[0].delta).toBe(-40);
  });

  it("adjustStock with a negative delta depletes the soonest-expiring lot first", () => {
    const soon = buyLot(100, "2026-07-01");
    buyLot(200, "2026-08-01");
    adjustStock(db, hid, flourId, -60, null, productId);
    const lots = lotsByProduct(db, hid).get(productId)!;
    expect(lots.find((l) => l.purchaseId === soon)!.remaining).toBe(40);
  });

  it("adjustStock with a positive delta and expiry creates a new manual lot", () => {
    adjustStock(db, hid, flourId, 500, "2026-09-01", productId);
    const lots = lotsByProduct(db, hid).get(productId)!;
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ expiresAt: "2026-09-01", remaining: 500, manual: true, pricePaidCents: null });
  });
});
