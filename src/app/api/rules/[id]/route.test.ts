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
import { createRule } from "@/lib/rules";
import { PATCH } from "./route";

let hid: number;
let slotId: number;
let ruleId: number;

function patch(id: number, body: unknown) {
  return PATCH(new Request(`http://x/api/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  hid = seedHousehold(db);
  slotId = createSlot(db, hid, "Dinner", "18:00").id;
  const ingredientId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Rice", canonicalUnit: "g" })
    .returning().all()[0].id;
  ruleId = createRule(db, hid, "2026-06-01", {
    slotId, ingredientId, amount: 100, servings: 1,
    intervalN: 1, unit: "week", daysOfWeek: "1111111", startDate: "2026-06-01", untilDate: null,
  }).id;
  vi.mocked(auth).mockResolvedValue({ user: { householdId: hid } } as never);
});

describe("PATCH /api/rules/[id] validation", () => {
  it("rejects an invalid unit instead of silently defaulting to week", async () => {
    const res = await patch(ruleId, { unit: "month" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer intervalN", async () => {
    const res = await patch(ruleId, { intervalN: 1.5 });
    expect(res.status).toBe(400);
  });

  it("rejects intervalN below 1", async () => {
    const res = await patch(ruleId, { intervalN: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed untilDate", async () => {
    const res = await patch(ruleId, { untilDate: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed daysOfWeek", async () => {
    const res = await patch(ruleId, { daysOfWeek: "abcdefg" });
    expect(res.status).toBe(400);
  });

  it("rejects a weekly rule with no day selected", async () => {
    const res = await patch(ruleId, { unit: "week", daysOfWeek: "0000000" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid recurrence patch", async () => {
    const res = await patch(ruleId, { unit: "day", intervalN: 2, untilDate: "2026-12-31" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unit).toBe("day");
    expect(body.intervalN).toBe(2);
    expect(body.untilDate).toBe("2026-12-31");
  });
});
