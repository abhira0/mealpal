import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { listPendingPurchases, listPurchaseHistory, recordPurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";
import { localNoon, todayISO } from "@/lib/dates";
import { parseLimit, parseOffset } from "@/lib/api-params";
import { readJson } from "@/lib/validate";

// Pending (not-yet-priced) purchases for the bill screen; ?all=1 for the full history tab.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const hid = session.user.householdId;
  if (!sp.get("all")) return NextResponse.json(listPendingPurchases(db, hid));
  const limit = parseLimit(sp.get("limit"));
  const offset = parseOffset(sp.get("offset"));
  if (offset === "invalid")
    return NextResponse.json({ error: "offset must be non-negative" }, { status: 400 });
  return NextResponse.json(listPurchaseHistory(db, hid, { limit, offset }));
}

// Record a purchase. Price is optional: omit cents/dollars to mark it bought
// but not yet priced (fill in later on the bill screen).
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req, {
    productId: { type: "number", required: true, integer: true, min: 1 },
    quantity: { type: "number", integer: true, min: 1 },
    cents: { type: "number", min: 0 },
    dollars: { type: "number", min: 0 },
    expiresAt: { type: "date" },
    purchasedAt: { type: "date" },
    shopId: { type: "number", integer: true, min: 1 },
  });
  if (parsed instanceof Response) return parsed;
  const { productId, expiresAt, shopId } = parsed;
  const quantity = parsed.quantity ?? 1;

  let cents: number | null = null;
  if (parsed.cents !== undefined) cents = parsed.cents;
  else if (parsed.dollars !== undefined) cents = dollarsToCents(parsed.dollars);

  // Optional backfill date (history tab). Never in the future — a typo'd year
  // would skew learned shelf life and history ordering.
  let purchasedAt: Date | null = null;
  if (parsed.purchasedAt !== undefined) {
    if (parsed.purchasedAt > todayISO())
      return NextResponse.json({ error: "purchasedAt can't be in the future" }, { status: 400 });
    purchasedAt = localNoon(parsed.purchasedAt);
  }
  try {
    return NextResponse.json(
      recordPurchase(db, session.user.householdId, { productId, quantity, cents: cents === null ? null : Math.round(cents), expiresAt, purchasedAt, shopId }),
      { status: 201 });
  } catch {
    // recordPurchase throws when productId doesn't belong to this household —
    // surface it as a 404, not an unhandled 500.
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }
}
