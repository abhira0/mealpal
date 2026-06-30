import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { listPendingPurchases, listPurchaseHistory, recordPurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";

// Pending (not-yet-priced) purchases for the bill screen; ?all=1 for the full history tab.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = new URL(req.url).searchParams.get("all");
  const hid = session.user.householdId;
  return NextResponse.json(all ? listPurchaseHistory(db, hid) : listPendingPurchases(db, hid));
}

// Record a purchase. Price is optional: omit cents/dollars to mark it bought
// but not yet priced (fill in later on the bill screen).
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = Number(b?.productId);
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const quantity = Number(b?.quantity) || 1;

  let cents: number | null = null;
  if (b?.cents !== undefined && b.cents !== null && b.cents !== "") cents = Number(b.cents);
  else if (b?.dollars !== undefined && b.dollars !== null && b.dollars !== "") cents = dollarsToCents(Number(b.dollars));
  if (cents !== null && (!Number.isFinite(cents) || cents < 0))
    return NextResponse.json({ error: "cents must be a non-negative number" }, { status: 400 });

  const expiresAt = typeof b?.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) ? b.expiresAt : null;
  return NextResponse.json(
    recordPurchase(db, session.user.householdId, { productId, quantity, cents: cents === null ? null : Math.round(cents), expiresAt }),
    { status: 201 });
}
