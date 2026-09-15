import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/scrape-products", () => ({
  connectAndExtract: vi.fn().mockResolvedValue({ name: "stub" }),
}));

// vitest sets NODE_ENV=test for the whole run; each test overrides it locally
// and restores it afterward so we don't leak into other test files.
const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
});

describe("POST /api/import/product", () => {
  it("returns 404 in production, without reaching auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { auth } = await import("@/auth");
    const { POST } = await import("./route");

    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(auth).not.toHaveBeenCalled();
  });

  it("does not short-circuit to 404 outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { auth } = await import("@/auth");
    const { POST } = await import("./route");

    const res = await POST();

    // No session mocked -> falls through to the existing auth gate (401), not 404.
    expect(res.status).toBe(401);
    expect(auth).toHaveBeenCalled();
  });
});
