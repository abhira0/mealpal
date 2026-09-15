import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteIngredient, ingredientDetail, updateIngredient } from "@/lib/ingredients";
import { CANONICAL_UNITS } from "@/lib/units";
import { validate } from "@/lib/validate";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const detail = ingredientDetail(db, session.user.householdId, Number(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  // Trim before validating so " g " still matches the enum, same as the old
  // isCanonicalUnit(String(...).trim()) check.
  if (body && typeof body.canonicalUnit === "string") body.canonicalUnit = body.canonicalUnit.trim();
  const parsed = validate(body, {
    canonicalUnit: { type: "enum", values: CANONICAL_UNITS },
  });
  if (parsed instanceof Response) return parsed;
  const row = updateIngredient(db, session.user.householdId, Number(id), {
    ...(body?.name !== undefined ? { name: String(body.name).trim() } : {}),
    ...(parsed.canonicalUnit !== undefined ? { canonicalUnit: parsed.canonicalUnit } : {}),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = deleteIngredient(db, session.user.householdId, Number(id));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  if (!result.deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
