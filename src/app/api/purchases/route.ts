import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { recordPurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = Number(b?.productId);
  const quantity = Number(b?.quantity) || 1;
  const cents = b?.cents !== undefined ? Number(b.cents)
    : b?.dollars !== undefined ? dollarsToCents(Number(b.dollars)) : NaN;
  if (!productId || !Number.isFinite(cents) || cents < 0)
    return NextResponse.json({ error: "productId and cents/dollars required" }, { status: 400 });
  const expiresAt = typeof b?.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) ? b.expiresAt : null;
  return NextResponse.json(
    recordPurchase(db, session.user.householdId, { productId, quantity, cents: Math.round(cents), expiresAt }),
    { status: 201 });
}
