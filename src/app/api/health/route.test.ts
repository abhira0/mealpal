import { describe, it, expect, vi, beforeEach } from "vitest";

const prepare = vi.fn();
vi.mock("@/db", () => ({
  db: { $client: { prepare: (...args: unknown[]) => prepare(...args) } },
}));

import { GET } from "./route";

beforeEach(() => {
  prepare.mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 {ok:true} when the DB query succeeds", async () => {
    prepare.mockReturnValue({ get: () => ({ "1": 1 }) });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 503 {ok:false} with no extra detail when the DB query throws", async () => {
    prepare.mockImplementation(() => {
      throw new Error("SQLITE_CANTOPEN: unable to open database file");
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toMatch(/SQLITE|schema|version|row/i);
  });
});
