import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { makeTestDb } = await import("@/test/db");
  const schema = await import("@/db/schema");
  const db = makeTestDb();
  return { db, schema };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { db, schema } from "@/db";
import { auth } from "@/auth";
import { seedHousehold } from "@/test/fixtures";
import { createProduct } from "@/lib/products";
import { recordPurchase } from "@/lib/shopping";
import { PATCH } from "./route";

let hid: number;
let productId: number;
let purchaseId: number;

function patch(id: number, body: unknown) {
  return PATCH(new Request(`http://x/api/purchases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  hid = seedHousehold(db);
  const ingredientId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Sugar", canonicalUnit: "g" })
    .returning().all()[0].id;
  const shopId = db.insert(schema.shops)
    .values({ householdId: hid, name: "Costco" })
    .returning().all()[0].id;
  productId = createProduct(db, hid, {
    ingredientId, shopId, name: "Sugar 5lb", packSize: 2268, priority: 1, url: null,
  }).id;
  purchaseId = recordPurchase(db, hid, { productId, quantity: 1, cents: null, expiresAt: null, purchasedAt: null, shopId: null }).id;
  vi.mocked(auth).mockResolvedValue({ user: { householdId: hid } } as never);
});

describe("PATCH /api/purchases/[id] validation", () => {
  it.each([0, -1, 1.5, "abc"])("rejects quantity %p with 400", async (quantity) => {
    const res = await patch(purchaseId, { quantity });
    expect(res.status).toBe(400);
  });

  it("accepts a valid quantity", async () => {
    const res = await patch(purchaseId, { quantity: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quantity).toBe(3);
  });

  it.each(["not-a-date", "2026/08/13", 20260813])("rejects malformed purchasedAt %p with 400", async (purchasedAt) => {
    const res = await patch(purchaseId, { purchasedAt });
    expect(res.status).toBe(400);
  });

  it("rejects a future purchasedAt", async () => {
    const res = await patch(purchaseId, { purchasedAt: "2999-01-01" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid past purchasedAt", async () => {
    const res = await patch(purchaseId, { purchasedAt: "2026-01-01" });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid productId", async () => {
    const res = await patch(purchaseId, { productId: -1 });
    expect(res.status).toBe(400);
  });

  it("still allows clearing shopId to null", async () => {
    const res = await patch(purchaseId, { shopId: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shopId).toBeNull();
  });

  it("still allows clearing cents to null via dollars", async () => {
    const res = await patch(purchaseId, { dollars: null });
    expect(res.status).toBe(200);
  });
});
