import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { householdId: 1 } })),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/ingredients", () => ({
  updateIngredient: vi.fn(() => ({ id: 1, name: "Flour", canonicalUnit: "g" })),
  deleteIngredient: vi.fn(),
  ingredientDetail: vi.fn(),
}));

import { PATCH } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/ingredients/1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/ingredients/[id]", () => {
  it("rejects an out-of-set canonicalUnit like 'lbs'", async () => {
    const res = await PATCH(req({ canonicalUnit: "lbs" }), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid canonicalUnit", async () => {
    const res = await PATCH(req({ canonicalUnit: "g" }), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(200);
  });

  it("trims whitespace before checking canonicalUnit", async () => {
    const res = await PATCH(req({ canonicalUnit: " g " }), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(200);
  });
});
