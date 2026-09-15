import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// bd-mealpal-kn3: analysis/ingredients routes must validate date the same way
// GET /api/nutrition already does, and drop non-integer eventIds.

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { householdId: 1 } })),
}));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, db: {} };
});

describe("GET /api/nutrition/analysis", () => {
  it("400s on a malformed date", async () => {
    vi.resetModules();
    const { GET } = await import("./analysis/route");
    const req = new NextRequest("http://x/api/nutrition/analysis?date=xyz");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/nutrition/ingredients", () => {
  it("400s on a malformed date", async () => {
    vi.resetModules();
    const { GET } = await import("./ingredients/route");
    const req = new NextRequest("http://x/api/nutrition/ingredients?date=xyz");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("filters non-integer eventIds before querying", async () => {
    vi.resetModules();
    const dayIngredientTable = vi.fn(() => []);
    vi.doMock("@/lib/nutrition", () => ({
      dayIngredientTable,
      weekIngredientTable: vi.fn(),
      mondayOf: vi.fn(),
    }));
    const { GET } = await import("./ingredients/route");
    const req = new NextRequest(
      "http://x/api/nutrition/ingredients?date=2026-07-01&eventIds=1,foo,3",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(dayIngredientTable).toHaveBeenCalledWith({}, 1, "2026-07-01", "served", [1, 3]);
    vi.doUnmock("@/lib/nutrition");
  });
});
