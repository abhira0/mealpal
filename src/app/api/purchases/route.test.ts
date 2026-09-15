import { describe, it, expect, vi, beforeEach } from "vitest";

// route.ts imports the real singleton `db`; swap it for an in-memory test db
// so POST can be exercised end-to-end without touching the real sqlite file.
vi.mock("@/db", async () => {
  const { makeTestDb } = await import("@/test/db");
  const schema = await import("@/db/schema");
  return { db: makeTestDb(), schema };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { db as testDb, schema } from "@/db";
import { auth } from "@/auth";
import { seedHousehold } from "@/test/fixtures";
import { createProduct } from "@/lib/products";
import { POST } from "@/app/api/purchases/route";

let hid: number;
let productId: number;

beforeEach(() => {
  hid = seedHousehold(testDb);
  const shopId = testDb.insert(schema.shops).values({ householdId: hid, name: "Costco" }).returning().all()[0].id;
  const ingredientId = testDb.insert(schema.ingredients)
    .values({ householdId: hid, name: "Sugar", canonicalUnit: "g" })
    .returning().all()[0].id;
  productId = createProduct(testDb, hid, {
    ingredientId, shopId, name: "Sugar 5lb", packSize: 2268, priority: 1, url: null,
  }).id;
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { householdId: hid } });
});

function post(body: unknown) {
  return POST(new Request("http://test/api/purchases", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/purchases quantity validation", () => {
  it("rejects a negative quantity", async () => {
    const res = await post({ productId, quantity: -3 });
    expect(res.status).toBe(400);
  });

  it("rejects a zero quantity", async () => {
    const res = await post({ productId, quantity: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a fractional quantity", async () => {
    const res = await post({ productId, quantity: 1.5 });
    expect(res.status).toBe(400);
  });

  it("accepts a positive integer quantity", async () => {
    const res = await post({ productId, quantity: 2 });
    expect(res.status).toBe(201);
  });

  it("defaults to quantity 1 when omitted", async () => {
    const res = await post({ productId });
    expect(res.status).toBe(201);
  });
});
