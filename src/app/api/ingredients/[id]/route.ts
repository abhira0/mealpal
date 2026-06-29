import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteIngredient, ingredientDetail, updateIngredient } from "@/lib/ingredients";

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
  const row = updateIngredient(db, session.user.householdId, Number(id), {
    ...(body?.name !== undefined ? { name: String(body.name).trim() } : {}),
    ...(body?.canonicalUnit !== undefined
      ? { canonicalUnit: String(body.canonicalUnit).trim() }
      : {}),
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
