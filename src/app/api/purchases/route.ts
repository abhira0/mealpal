import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { listPendingPurchases, listPurchaseHistory, recordPurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";
import { DATE_RE, localNoon, todayISO } from "@/lib/dates";

// Pending (not-yet-priced) purchases for the bill screen; ?all=1 for the full history tab.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const hid = session.user.householdId;
  if (!sp.get("all")) return NextResponse.json(listPendingPurchases(db, hid));
  const limit = Number(sp.get("limit")) || undefined;
  const offset = Number(sp.get("offset")) || undefined;
  return NextResponse.json(listPurchaseHistory(db, hid, { limit, offset }));
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

  const expiresAt = typeof b?.expiresAt === "string" && DATE_RE.test(b.expiresAt) ? b.expiresAt : null;
  // Optional backfill date (history tab). Never in the future — a typo'd year
  // would skew learned shelf life and history ordering.
  let purchasedAt: Date | null = null;
  if (typeof b?.purchasedAt === "string" && DATE_RE.test(b.purchasedAt)) {
    if (b.purchasedAt > todayISO())
      return NextResponse.json({ error: "purchasedAt can't be in the future" }, { status: 400 });
    purchasedAt = localNoon(b.purchasedAt);
  }
  // Optional shop override; otherwise the purchase inherits the product's usual shop.
  let shopId: number | null = null;
  if (b?.shopId !== undefined && b.shopId !== null && b.shopId !== "") {
    shopId = Number(b.shopId);
    if (!Number.isInteger(shopId) || shopId < 1)
      return NextResponse.json({ error: "invalid shopId" }, { status: 400 });
  }
  return NextResponse.json(
    recordPurchase(db, session.user.householdId, { productId, quantity, cents: cents === null ? null : Math.round(cents), expiresAt, purchasedAt, shopId }),
    { status: 201 });
}
