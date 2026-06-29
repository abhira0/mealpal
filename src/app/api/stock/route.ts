import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, expiryByIngredient, adjustStock } from "@/lib/stock";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const qty = stockByIngredient(db, session.user.householdId);
  const expiry = expiryByIngredient(db, session.user.householdId);
  return NextResponse.json({ qty: Object.fromEntries(qty), expiry: Object.fromEntries(expiry) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const delta = Number(b?.delta);
  const expiresAt = typeof b?.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) ? b.expiresAt : null;
  if (!ingredientId || !Number.isFinite(delta))
    return NextResponse.json({ error: "ingredientId and numeric delta required" }, { status: 400 });
  return NextResponse.json(
    adjustStock(db, session.user.householdId, ingredientId, delta, expiresAt), { status: 201 });
}
