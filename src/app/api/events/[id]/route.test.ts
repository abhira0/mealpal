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
import { createSlot } from "@/lib/slots";
import { addEvent } from "@/lib/plan";
import { PATCH } from "./route";

let hid: number;
let slotId: number;
let ingredientId: number;
let eventId: number;

function patch(id: number, body: unknown) {
  return PATCH(new Request(`http://x/api/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  hid = seedHousehold(db);
  slotId = createSlot(db, hid, "Dinner", "18:00").id;
  ingredientId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Rice", canonicalUnit: "g" })
    .returning().all()[0].id;
  eventId = addEvent(db, hid, { date: "2026-06-01", slotId, servings: 1, ingredientId, amount: 100 }).id;
  vi.mocked(auth).mockResolvedValue({ user: { householdId: hid } } as never);
});

describe("PATCH /api/events/[id] validation", () => {
  it("rejects a missing date/slotId", async () => {
    const res = await patch(eventId, {});
    expect(res.status).toBe(400);
  });

  it("rejects a malformed date", async () => {
    const res = await patch(eventId, { date: "2026/06/02", slotId });
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric slotId", async () => {
    const res = await patch(eventId, { date: "2026-06-02", slotId: "abc" });
    expect(res.status).toBe(400);
  });

  it("404s when slotId doesn't belong to the household", async () => {
    const res = await patch(eventId, { date: "2026-06-02", slotId: slotId + 999 });
    expect(res.status).toBe(404);
  });

  it("accepts a valid patch", async () => {
    const res = await patch(eventId, { date: "2026-06-02", slotId, ingredientId, amount: 150 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-06-02");
    expect(body.amount).toBe(150);
  });
});
