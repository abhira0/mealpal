import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updatePurchase, deletePurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";

// Fill in / correct a purchase: price, expiry, quantity, purchase date. Household-scoped.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);

  const patch: { cents?: number | null; expiresAt?: string | null; quantity?: number; productId?: number; purchasedAt?: Date } = {};

  if (b?.productId !== undefined) {
    const p = Number(b.productId);
    if (!Number.isInteger(p) || p < 1) return NextResponse.json({ error: "invalid productId" }, { status: 400 });
    patch.productId = p;
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
    patch.expiresAt = typeof b.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) ? b.expiresAt : null;

  if (b?.quantity !== undefined) {
    const q = Number(b.quantity);
    if (!Number.isInteger(q) || q < 1) return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    patch.quantity = q;
  }

  if (b?.purchasedAt !== undefined) {
    // date-only YYYY-MM-DD, anchored at local noon so it doesn't roll a day in
    // negative-offset timezones. Reject anything malformed.
    if (typeof b.purchasedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.purchasedAt))
      return NextResponse.json({ error: "invalid purchasedAt" }, { status: 400 });
    patch.purchasedAt = new Date(`${b.purchasedAt}T12:00:00`);
  }

  const row = updatePurchase(db, session.user.householdId, Number(id), patch);
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
