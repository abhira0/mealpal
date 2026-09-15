import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updatePurchase, deletePurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";
import { DATE_RE, localNoon, todayISO } from "@/lib/dates";
import { validate } from "@/lib/validate";

// Fill in / correct a purchase: price, expiry, quantity, purchase date. Household-scoped.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);

  // productId/quantity/purchasedAt are plain "value or absent" fields, so they
  // fit validate() directly. shopId/cents/dollars/expiresAt below all support
  // an explicit null to clear an override — validate() treats null the same
  // as absent, so those stay hand-rolled to keep the clear-to-null behavior.
  const parsed = validate(b, {
    productId: { type: "number", integer: true, min: 1 },
    quantity: { type: "number", integer: true, min: 1 },
    purchasedAt: { type: "date" },
  });
  if (parsed instanceof Response) return parsed;

  const patch: { cents?: number | null; expiresAt?: string | null; quantity?: number; productId?: number; shopId?: number | null; purchasedAt?: Date } = {};

  if (parsed.productId !== undefined) patch.productId = parsed.productId;

  // null clears the override (fall back to the product's shop); a positive int overrides it.
  if (b?.shopId !== undefined) {
    if (b.shopId === null) patch.shopId = null;
    else {
      const s = Number(b.shopId);
      if (!Number.isInteger(s) || s < 1) return NextResponse.json({ error: "invalid shopId" }, { status: 400 });
      patch.shopId = s;
    }
  }

  if (b?.cents !== undefined || b?.dollars !== undefined) {
    const raw = b.cents !== undefined ? b.cents : b.dollars;
    if (raw === null || raw === "") patch.cents = null;
    else {
      const c = b.cents !== undefined ? Number(b.cents) : dollarsToCents(Number(b.dollars));
      if (!Number.isFinite(c) || c < 0) return NextResponse.json({ error: "invalid price" }, { status: 400 });
      patch.cents = Math.round(c);
    }
  }

  if (b?.expiresAt !== undefined)
    patch.expiresAt = typeof b.expiresAt === "string" && DATE_RE.test(b.expiresAt) ? b.expiresAt : null;

  if (parsed.quantity !== undefined) patch.quantity = parsed.quantity;

  if (parsed.purchasedAt !== undefined) {
    // date-only YYYY-MM-DD; reject anything malformed or in the future (a
    // typo'd year would skew learned shelf life and history ordering).
    if (parsed.purchasedAt > todayISO())
      return NextResponse.json({ error: "purchasedAt can't be in the future" }, { status: 400 });
    patch.purchasedAt = localNoon(parsed.purchasedAt);
  }

  // updatePurchase throws when a swapped productId doesn't resolve in this
  // household — a bad request, not a server error.
  let row;
  try {
    row = updatePurchase(db, session.user.householdId, Number(id), patch);
  } catch {
    return NextResponse.json({ error: "invalid productId" }, { status: 400 });
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

// Undo a purchase recorded by mistake (also reverses the restock). Household-scoped.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = deletePurchase(db, session.user.householdId, Number(id));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
