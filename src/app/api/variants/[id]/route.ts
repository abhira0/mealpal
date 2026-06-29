import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updateVariant, deleteVariant, type VariantPatch } from "@/lib/variants";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const patch: VariantPatch = {};
  if (b?.name !== undefined) patch.name = String(b.name).trim();
  if (b?.nutritionPhoto !== undefined) patch.nutritionPhoto = b.nutritionPhoto === null ? null : String(b.nutritionPhoto);
  for (const k of NUTRIENT_PATCH_KEYS) if (b?.[k] !== undefined) patch[k] = b[k] === null ? null : Number(b[k]);
  const row = updateVariant(db, session.user.householdId, Number((await params).id), patch);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = deleteVariant(db, session.user.householdId, Number((await params).id));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
