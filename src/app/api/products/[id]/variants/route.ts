import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createVariant, listVariants } from "@/lib/variants";
import { NUTRIENT_PATCH_KEYS } from "@/lib/products";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listVariants(db, session.user.householdId, Number((await params).id)));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await params).id);
  const b = await req.json().catch(() => null);
  const name = b?.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const nutrients: Record<string, number | null> = {};
  for (const k of NUTRIENT_PATCH_KEYS) if (b?.[k] !== undefined) nutrients[k] = b[k] === null ? null : Number(b[k]);
  const row = createVariant(db, session.user.householdId, productId, {
    name, nutritionPhoto: b?.nutritionPhoto ?? null, ...nutrients,
  });
  return NextResponse.json(row, { status: 201 });
}
