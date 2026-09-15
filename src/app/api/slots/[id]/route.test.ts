import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { createSlot } from "@/lib/slots";

let testDb: TestDb;
let hid: number;
let slotId: number;

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
  slotId = createSlot(testDb, hid, "Dinner", "18:00").id;
});

function patch(body: unknown) {
  return new Request(`http://test/api/slots/${slotId}`, { method: "PATCH", body: JSON.stringify(body) });
}

describe("PATCH /api/slots/[id] timeOfDay validation", () => {
  it("rejects a non-zero-padded time like '9:00'", async () => {
    const { PATCH } = await import("@/app/api/slots/[id]/route");
    const res = await PATCH(patch({ name: "Dinner", timeOfDay: "9:00" }), { params: Promise.resolve({ id: String(slotId) }) });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range time like '25:00'", async () => {
    const { PATCH } = await import("@/app/api/slots/[id]/route");
    const res = await PATCH(patch({ name: "Dinner", timeOfDay: "25:00" }), { params: Promise.resolve({ id: String(slotId) }) });
    expect(res.status).toBe(400);
  });

  it("accepts a zero-padded time like '09:00'", async () => {
    const { PATCH } = await import("@/app/api/slots/[id]/route");
    const res = await PATCH(patch({ name: "Dinner", timeOfDay: "09:00" }), { params: Promise.resolve({ id: String(slotId) }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.timeOfDay).toBe("09:00");
  });
});
