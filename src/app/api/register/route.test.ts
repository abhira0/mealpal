import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/users", () => ({
  findUserByEmail: vi.fn().mockResolvedValue(null),
  registerHousehold: vi.fn().mockResolvedValue({ id: 1 }),
}));

function makeRequest(ip: string, body: unknown = { email: "a@b.com", password: "hunter22" }) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/register", () => {
  const originalFlag = process.env.ALLOW_REGISTRATION;

  afterEach(() => {
    process.env.ALLOW_REGISTRATION = originalFlag;
  });

  it("returns 403 when registration is disabled", async () => {
    delete process.env.ALLOW_REGISTRATION;
    const { POST } = await import("./route");
    const res = await POST(makeRequest("1.1.1.1"));
    expect(res.status).toBe(403);
  });

  it("rate limits after too many attempts from the same IP", async () => {
    process.env.ALLOW_REGISTRATION = "true";
    const { POST } = await import("./route");
    const ip = "2.2.2.2";

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await POST(makeRequest(ip));
      lastStatus = res.status;
      if (i < 10) expect(res.status).not.toBe(429);
    }
    expect(lastStatus).toBe(429);
  });
});
