import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";

const state = vi.hoisted(() => ({ db: null as unknown as TestDb, session: null as unknown as { user: { householdId: number } } }));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  return {
    get db() { return state.db; },
    schema,
  };
});

vi.mock("@/auth", () => ({
  auth: () => Promise.resolve(state.session),
}));

const { POST, DELETE } = await import("./route");
const { schema } = await import("@/db");

let db: TestDb;
let hid: number;
let slotId: number;
let batchId: number;

beforeEach(() => {
  db = makeTestDb();
  state.db = db;
  hid = seedHousehold(db);
  state.session = { user: { householdId: hid } };
  slotId = db.insert(schema.mealSlots).values({ householdId: hid, name: "Lunch", timeOfDay: "12:00" }).returning().all()[0].id;
  batchId = db.insert(schema.batches).values({
    householdId: hid, slotId, label: "Biryani lunch", cookedDate: "2026-08-09",
    mealsTotal: 4, mealsRemaining: 4,
  }).returning().all()[0].id;
});

function req(body: unknown) {
  return new Request("http://test/api/batches/1/eat", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/batches/[id]/eat", () => {
  it("400s on an invalid date", async () => {
    const res = await POST(req({ date: "not-a-date" }), { params: Promise.resolve({ id: String(batchId) }) });
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent batch id", async () => {
    const res = await POST(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
  });

  it("404s for a batch belonging to another household", async () => {
    const otherHid = seedHousehold(db, "Other Home");
    const otherSlot = db.insert(schema.mealSlots).values({ householdId: otherHid, name: "Dinner", timeOfDay: "18:00" }).returning().all()[0].id;
    const otherBatch = db.insert(schema.batches).values({
      householdId: otherHid, slotId: otherSlot, label: "Foreign batch", cookedDate: "2026-08-09",
      mealsTotal: 2, mealsRemaining: 2,
    }).returning().all()[0].id;
    const res = await POST(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: String(otherBatch) }) });
    expect(res.status).toBe(404);
  });

  it("still works with a valid date and batch", async () => {
    const res = await POST(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: String(batchId) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mealsRemaining).toBe(3);
  });
});

describe("DELETE /api/batches/[id]/eat", () => {
  it("400s on an invalid date", async () => {
    const res = await DELETE(req({ date: "08-09-2026" }), { params: Promise.resolve({ id: String(batchId) }) });
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent batch id", async () => {
    const res = await DELETE(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
  });

  it("still works with a valid date and batch", async () => {
    await POST(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: String(batchId) }) });
    const res = await DELETE(req({ date: "2026-08-09" }), { params: Promise.resolve({ id: String(batchId) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mealsRemaining).toBe(4);
  });
});
