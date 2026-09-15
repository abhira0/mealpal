import { NextResponse } from "next/server";
import { DATE_RE } from "./dates";

/**
 * Minimal request-body validation, no schema library. Every API route hand-rolled
 * `Number(b?.x)` / `DATE_RE.test(...)` checks with inconsistent error shapes; this
 * gives them one place to declare a field's type and get a consistent 400 back.
 */
export type FieldSpec =
  | { type: "number"; required?: boolean; integer?: boolean; min?: number }
  | { type: "date"; required?: boolean }
  | { type: "enum"; values: readonly string[]; required?: boolean }
  | { type: "string"; required?: boolean; trim?: boolean };

export type Shape = Record<string, FieldSpec>;

type ValueOf<F extends FieldSpec> = F extends { type: "number" }
  ? number
  : F extends { type: "date" }
    ? string
    : F extends { type: "enum"; values: readonly (infer V)[] }
      ? V
      : string;

export type Validated<S extends Shape> = {
  [K in keyof S]: S[K]["required"] extends true ? ValueOf<S[K]> : ValueOf<S[K]> | undefined;
};

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Validates an already-parsed body against `shape`. A present-but-null/"" field is treated as absent. */
export function validate<S extends Shape>(body: unknown, shape: S): Validated<S> | Response {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const spec = shape[key];
    const raw = b[key];
    const present = raw !== undefined && raw !== null && raw !== "";
    if (!present) {
      if (spec.required) return badRequest(`${key} required`);
      continue;
    }
    switch (spec.type) {
      case "number": {
        const n = Number(raw);
        if (typeof raw === "boolean" || !Number.isFinite(n)) return badRequest(`${key} must be a number`);
        if (spec.integer && !Number.isInteger(n)) return badRequest(`${key} must be an integer`);
        if (spec.min !== undefined && n < spec.min) return badRequest(`${key} must be >= ${spec.min}`);
        out[key] = n;
        break;
      }
      case "date": {
        if (typeof raw !== "string" || !DATE_RE.test(raw)) return badRequest(`${key} must be YYYY-MM-DD`);
        out[key] = raw;
        break;
      }
      case "enum": {
        if (typeof raw !== "string" || !spec.values.includes(raw))
          return badRequest(`${key} must be one of ${spec.values.join(", ")}`);
        out[key] = raw;
        break;
      }
      case "string": {
        if (typeof raw !== "string") return badRequest(`${key} must be a string`);
        const value = spec.trim ? raw.trim() : raw;
        if (spec.required && value === "") return badRequest(`${key} required`);
        out[key] = value;
        break;
      }
    }
  }
  return out as Validated<S>;
}

/**
 * Parses the request body as JSON and validates it against `shape` in one call.
 * Returns either the validated values or a ready-to-return 400 Response:
 *
 *   const parsed = await readJson(req, { productId: { type: "number", required: true, integer: true } });
 *   if (parsed instanceof Response) return parsed;
 *   const { productId } = parsed;
 */
export async function readJson<S extends Shape>(req: Request, shape: S): Promise<Validated<S> | Response> {
  const body = await req.json().catch(() => null);
  return validate(body, shape);
}
