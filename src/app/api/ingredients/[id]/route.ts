import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updateIngredient } from "@/lib/ingredients";

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
    ...(body?.servingSize !== undefined
      ? { servingSize: body.servingSize === null ? null : Number(body.servingSize) }
      : {}),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
