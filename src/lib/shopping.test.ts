import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createProduct } from "@/lib/products";
import { recordPurchase, listPendingPurchases, listPurchaseHistory, updatePurchase, deletePurchase, learnedShelfLife, addExtra, listExtras, deleteExtra } from "@/lib/shopping";
import { currentStock } from "@/lib/stock";

let db: TestDb;
let hid: number;
let flourId: number;
let shopId: number;
let productId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
  shopId = db.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  productId = createProduct(db, hid, {
    ingredientId: flourId, shopId, name: "AP Flour 25lb",
    packSize: 11340, priority: 1, url: null,
  }).id;
});

describe("recordPurchase", () => {
  it("buying 1 product restocks packSize*qty into inventory and records the purchase", () => {
    recordPurchase(db, hid, { productId, quantity: 1, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(11340);
    const purchases = db.select().from(schema.purchases)
      .where(eq(schema.purchases.householdId, hid)).all();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].cents).toBe(1299);
  });

  it("buying 2 adds 2x the pack size", () => {
    recordPurchase(db, hid, { productId, quantity: 2, cents: 1299 });
    expect(currentStock(db, hid, flourId)).toBe(22680);
  });
});

describe("deletePurchase", () => {
  it("removes the purchase and reverses its restock", () => {
    const pid = recordPurchase(db, hid, { productId, quantity: 1 }).id;
    expect(currentStock(db, hid, flourId)).toBe(11340);
    expect(deletePurchase(db, hid, pid)).toBe(true);
    expect(currentStock(db, hid, flourId)).toBe(0);
    expect(listPendingPurchases(db, hid)).toHaveLength(0);
  });
});

describe("updatePurchase product swap", () => {
  it("re-points the restock to the substitute product (wanted one was out)", () => {
    const altId = createProduct(db, hid, {
      ingredientId: flourId, shopId, name: "AP Flour 10lb",
      packSize: 4536, priority: 2, url: null,
    }).id;
    const pid = recordPurchase(db, hid, { productId, quantity: 1 }).id;
    expect(currentStock(db, hid, flourId)).toBe(11340);

    updatePurchase(db, hid, pid, { productId: altId });
    // ingredient stock now reflects the substitute's pack size, not the original
    expect(currentStock(db, hid, flourId)).toBe(4536);
    const mv = db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.purchaseId, pid)).all();
    expect(mv[0].productId).toBe(altId);
  });
});

describe("learnedShelfLife", () => {
  // insert a purchase with a controlled purchasedAt + expiresAt
  function buy(purchasedAt: string, expiresAt: string | null) {
    db.insert(schema.purchases).values({
      householdId: hid, productId, quantity: 1, cents: 100,
      purchasedAt: new Date(purchasedAt), expiresAt,
    }).run();
  }

  it("takes the median day-gap over dated purchases, per ingredient", () => {
    buy("2026-06-01T00:00:00Z", "2026-06-06"); // 5
    buy("2026-06-10T00:00:00Z", "2026-06-17"); // 7
    buy("2026-06-20T00:00:00Z", "2026-06-29"); // 9
    expect(learnedShelfLife(db, hid).get(flourId)).toBe(7); // median of [5,7,9]
  });

  it("ignores undated purchases and needs at least 2 dated ones", () => {
    buy("2026-06-01T00:00:00Z", "2026-06-06");
    buy("2026-06-10T00:00:00Z", null); // no expiry → ignored
    expect(learnedShelfLife(db, hid).has(flourId)).toBe(false); // only 1 dated → untrusted
  });
});

describe("pending purchases (bill flow)", () => {
  it("records price-less, lists it as pending, then fills it in", () => {
    // check-off in the store: no price, but it restocks immediately
    const pid = recordPurchase(db, hid, { productId, quantity: 1 }).id;
    expect(currentStock(db, hid, flourId)).toBe(11340);

    const pending = listPendingPurchases(db, hid);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(pid);

    // enter the bill at home: price + expiry, and bump qty 1 → 2
    updatePurchase(db, hid, pid, { cents: 1499, expiresAt: "2026-07-01", quantity: 2 });

    expect(listPendingPurchases(db, hid)).toHaveLength(0); // priced → no longer pending
    expect(currentStock(db, hid, flourId)).toBe(22680);    // qty change re-synced restock
    const row = db.select().from(schema.purchases).where(eq(schema.purchases.id, pid)).all()[0];
    expect(row.cents).toBe(1499);
    expect(row.expiresAt).toBe("2026-07-01");
  });
});

describe("listPurchaseHistory", () => {
  it("lists every purchase newest-first, priced or not, prefilled with the paid price", () => {
    const oldId = recordPurchase(db, hid, { productId, quantity: 1, cents: 1299 }).id;
    db.update(schema.purchases).set({ purchasedAt: new Date("2026-06-01T00:00:00Z") })
      .where(eq(schema.purchases.id, oldId)).run();
    const newId = recordPurchase(db, hid, { productId, quantity: 2 }).id; // unpriced

    const hist = listPurchaseHistory(db, hid);
    expect(hist.map((r) => r.id)).toEqual([newId, oldId]); // newest first
    expect(hist.find((r) => r.id === oldId)?.hintCents).toBe(1299); // actual paid price
    expect(hist.find((r) => r.id === newId)?.hintCents).toBeNull(); // unpriced still shows
  });

  it("paginates with limit/offset, newest first", () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = recordPurchase(db, hid, { productId, quantity: 1 }).id;
      db.update(schema.purchases).set({ purchasedAt: new Date(2026, 0, i + 1) })
        .where(eq(schema.purchases.id, id)).run();
      ids.push(id); // ids[4] is newest
    }
    const page1 = listPurchaseHistory(db, hid, { limit: 2, offset: 0 });
    const page2 = listPurchaseHistory(db, hid, { limit: 2, offset: 2 });
    expect(page1.map((r) => r.id)).toEqual([ids[4], ids[3]]);
    expect(page2.map((r) => r.id)).toEqual([ids[2], ids[1]]);
  });
});

describe("manual extras", () => {
  it("a product extra reports the product's shop; a free-text extra uses its chosen shop", () => {
    const trader = db.insert(schema.shops).values({ householdId: hid, name: "Trader Joe's" }).returning().all()[0].id;
    addExtra(db, hid, { productId }); // tracked → Costco (the product's shop)
    addExtra(db, hid, { title: "Birthday cake", shopId: trader }); // one-off → chosen stop
    addExtra(db, hid, { title: "Random snack" }); // one-off, no stop

    const extras = listExtras(db, hid);
    expect(extras).toHaveLength(3);
    const byProduct = extras.find((e) => e.productId);
    expect(byProduct?.shopName).toBe("Costco");
    expect(extras.find((e) => e.title === "Birthday cake")?.shopName).toBe("Trader Joe's");
    expect(extras.find((e) => e.title === "Random snack")?.shopName).toBeNull();
  });

  it("deletes only the named household's extra", () => {
    const e = addExtra(db, hid, { title: "Paper towels" });
    expect(deleteExtra(db, hid, e.id)).toBe(true);
    expect(listExtras(db, hid)).toHaveLength(0);
    expect(deleteExtra(db, hid, e.id)).toBe(false); // already gone
  });
});
