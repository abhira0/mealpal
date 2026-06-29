import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { updatePurchase } from "@/lib/shopping";
import { dollarsToCents } from "@/lib/money";

// Fill in / correct a purchase: price, expiry, quantity. Household-scoped.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);

  const patch: { cents?: number | null; expiresAt?: string | null; quantity?: number } = {};

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

  const row = updatePurchase(db, session.user.householdId, Number(id), patch);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
