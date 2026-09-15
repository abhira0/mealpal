import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";

let testDb: TestDb;
let hid: number;

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  return {
    get db() {
      return testDb;
    },
    schema,
  };
});
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { householdId: hid } })),
}));

beforeEach(() => {
  testDb = makeTestDb();
  hid = seedHousehold(testDb);
});

function post(body: unknown) {
  return new Request("http://test/api/slots", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/slots timeOfDay validation", () => {
  it("rejects a non-zero-padded time like '9:00'", async () => {
    const { POST } = await import("@/app/api/slots/route");
    const res = await POST(post({ name: "Snack", timeOfDay: "9:00" }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range time like '25:00'", async () => {
    const { POST } = await import("@/app/api/slots/route");
    const res = await POST(post({ name: "Snack", timeOfDay: "25:00" }));
    expect(res.status).toBe(400);
  });

  it("accepts a zero-padded time like '09:00'", async () => {
    const { POST } = await import("@/app/api/slots/route");
    const res = await POST(post({ name: "Snack", timeOfDay: "09:00" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.timeOfDay).toBe("09:00");
  });
});
