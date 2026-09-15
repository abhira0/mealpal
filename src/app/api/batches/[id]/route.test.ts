import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { makeTestDb } = await import("@/test/db");
  const schema = await import("@/db/schema");
  const db = makeTestDb();
  return { db, schema };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { db } from "@/db";
import { auth } from "@/auth";
import { seedHousehold } from "@/test/fixtures";
import { createSlot } from "@/lib/slots";
import { packBatch } from "@/lib/batches";
import { PATCH } from "./route";

let hid: number;
let slotId: number;
let batchId: number;

function patch(id: number, body: unknown) {
  return PATCH(new Request(`http://x/api/batches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  hid = seedHousehold(db);
  slotId = createSlot(db, hid, "Dinner", "18:00").id;
  batchId = packBatch(db, hid, {
    slotId, label: "Chili", cookedDate: "2026-06-01", mealsTotal: 4, items: [],
  }).id;
  vi.mocked(auth).mockResolvedValue({ user: { householdId: hid } } as never);
});

describe("PATCH /api/batches/[id] validation", () => {
  it("rejects a missing slotId/label/mealsTotal", async () => {
    const res = await patch(batchId, {});
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric slotId", async () => {
    const res = await patch(batchId, { slotId: "abc", label: "Chili", mealsTotal: 2 });
    expect(res.status).toBe(400);
  });

  it("rejects a blank label", async () => {
    const res = await patch(batchId, { slotId, label: "   ", mealsTotal: 2 });
    expect(res.status).toBe(400);
  });

  it("rejects mealsTotal below 1", async () => {
    const res = await patch(batchId, { slotId, label: "Chili", mealsTotal: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed cookedDate", async () => {
    const res = await patch(batchId, { slotId, label: "Chili", mealsTotal: 2, cookedDate: "06/01/2026" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid patch and re-packs the batch", async () => {
    const res = await patch(batchId, { slotId, label: "Chili v2", mealsTotal: 3, cookedDate: "2026-06-02" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.label).toBe("Chili v2");
    expect(body.mealsTotal).toBe(3);
    expect(body.cookedDate).toBe("2026-06-02");
  });
});
