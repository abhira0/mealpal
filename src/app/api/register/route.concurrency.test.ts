import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { makeTestDb } from "@/test/db";
import * as schema from "@/db/schema";

// mealpal-gxg: registerHousehold does a check-then-insert on email with no
// locking. Two concurrent signups for the same email can both pass the
// pre-check; the UNIQUE index on users.email is the real guard, and the
// route must turn its constraint violation into a 409, not a 500.
const testDb = makeTestDb();
vi.mock("@/db", () => ({ db: testDb, schema }));

describe("POST /api/register concurrency", () => {
  const originalFlag = process.env.ALLOW_REGISTRATION;

  beforeAll(() => {
    process.env.ALLOW_REGISTRATION = "true";
  });

  afterAll(() => {
    process.env.ALLOW_REGISTRATION = originalFlag;
  });

  it("handles two simultaneous signups with the same email: one 201, one 409, no 500, one user row", async () => {
    const { POST } = await import("./route");
    const email = "race@example.com";
    const makeReq = () =>
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ email, password: "hunter22" }),
      });

    const [res1, res2] = await Promise.all([POST(makeReq()), POST(makeReq())]);
    const statuses = [res1.status, res2.status].sort((a, b) => a - b);

    expect(statuses).toEqual([201, 409]);

    const rows = testDb.select().from(schema.users).all();
    const matching = rows.filter((r) => r.email === email);
    expect(matching).toHaveLength(1);
  });
});
