import { describe, expect, it } from "vitest";
import { validate } from "./validate";

async function status(result: ReturnType<typeof validate>): Promise<number | null> {
  return result instanceof Response ? result.status : null;
}

async function errorMessage(result: ReturnType<typeof validate>): Promise<string | null> {
  if (!(result instanceof Response)) return null;
  const body = await result.json();
  return body.error;
}

describe("validate: number", () => {
  it("coerces numeric strings and accepts numbers", () => {
    const out = validate({ qty: "3" }, { qty: { type: "number", required: true } });
    expect(out).toEqual({ qty: 3 });
  });

  it("rejects NaN, Infinity, and non-numeric strings with a 400", async () => {
    for (const bad of ["abc", "Infinity", "NaN", {}, [1, 2]]) {
      const out = validate({ qty: bad }, { qty: { type: "number", required: true } });
      expect(await status(out)).toBe(400);
      expect(await errorMessage(out)).toBe("qty must be a number");
    }
  });

  it("rejects booleans (Number(true) is 1, which would silently pass)", async () => {
    const out = validate({ qty: true }, { qty: { type: "number", required: true } });
    expect(await status(out)).toBe(400);
  });

  it("enforces integer and min constraints", async () => {
    const notInt = validate({ qty: 1.5 }, { qty: { type: "number", required: true, integer: true } });
    expect(await status(notInt)).toBe(400);

    const tooLow = validate({ qty: 0 }, { qty: { type: "number", required: true, min: 1 } });
    expect(await status(tooLow)).toBe(400);

    const ok = validate({ qty: 2 }, { qty: { type: "number", required: true, integer: true, min: 1 } });
    expect(ok).toEqual({ qty: 2 });
  });

  it("skips optional numbers that are absent, null, or empty", () => {
    const out = validate({}, { qty: { type: "number" } });
    expect(out).toEqual({});
    expect(validate({ qty: null }, { qty: { type: "number" } })).toEqual({});
    expect(validate({ qty: "" }, { qty: { type: "number" } })).toEqual({});
  });

  it("400s when a required number is missing", async () => {
    const out = validate({}, { qty: { type: "number", required: true } });
    expect(await status(out)).toBe(400);
    expect(await errorMessage(out)).toBe("qty required");
  });
});

describe("validate: date", () => {
  it("accepts well-formed YYYY-MM-DD strings", () => {
    expect(validate({ d: "2026-08-13" }, { d: { type: "date", required: true } })).toEqual({ d: "2026-08-13" });
  });

  it("rejects malformed dates and non-strings with a 400", async () => {
    for (const bad of ["2026/08/13", "13-08-2026", "2026-08-13T00:00:00", 20260813]) {
      const out = validate({ d: bad }, { d: { type: "date", required: true } });
      expect(await status(out)).toBe(400);
      expect(await errorMessage(out)).toBe("d must be YYYY-MM-DD");
    }
  });

  it("skips an optional date that's absent", () => {
    expect(validate({}, { d: { type: "date" } })).toEqual({});
  });
});

describe("validate: enum", () => {
  const values = ["g", "ml", "oz", "count"] as const;

  it("accepts a listed value", () => {
    expect(validate({ unit: "g" }, { unit: { type: "enum", values, required: true } })).toEqual({ unit: "g" });
  });

  it("rejects values outside the allowed list with a 400", async () => {
    const out = validate({ unit: "lb" }, { unit: { type: "enum", values, required: true } });
    expect(await status(out)).toBe(400);
    expect(await errorMessage(out)).toBe("unit must be one of g, ml, oz, count");
  });
});

describe("validate: error shape", () => {
  it("always returns {error: string} in the body on failure", async () => {
    const out = validate({}, { x: { type: "number", required: true } });
    expect(out).toBeInstanceOf(Response);
    if (out instanceof Response) {
      const body = await out.json();
      expect(Object.keys(body)).toEqual(["error"]);
      expect(typeof body.error).toBe("string");
    }
  });
});
