import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, adjustStock } from "@/lib/stock";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const map = stockByIngredient(db, session.user.householdId);
  return NextResponse.json(Object.fromEntries(map));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const delta = Number(b?.delta);
  if (!ingredientId || !Number.isFinite(delta))
    return NextResponse.json({ error: "ingredientId and numeric delta required" }, { status: 400 });
  return NextResponse.json(
    adjustStock(db, session.user.householdId, ingredientId, delta), { status: 201 });
}
