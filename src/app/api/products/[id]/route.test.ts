import { describe, it, expect, beforeEach, vi } from "vitest";

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
import { PATCH } from "./route";

let hid: number;
let productId: number;

function patch(id: number, body: unknown) {
  return PATCH(new Request(`http://x/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  hid = seedHousehold(db);
  const ingredientId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
  const shopId = db.insert(schema.shops)
    .values({ householdId: hid, name: "Costco" })
    .returning().all()[0].id;
  const product = createProduct(db, hid, {
    ingredientId, shopId, name: "Kirkland AP Flour 25lb", packSize: 11340, priority: 1, url: null,
  });
  productId = product.id;
  vi.mocked(auth).mockResolvedValue({ user: { householdId: hid } } as never);
});

describe("PATCH /api/products/[id] packSize validation", () => {
  it.each([0, -1, "abc"])("rejects packSize %p with 400", async (packSize) => {
    const res = await patch(productId, { packSize });
    expect(res.status).toBe(400);
  });

  it("accepts a valid packSize", async () => {
    const res = await patch(productId, { packSize: 500 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packSize).toBe(500);
  });
});
