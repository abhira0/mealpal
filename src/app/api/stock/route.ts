import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, stockByProduct, expiryByIngredient, expiryByProduct, adjustStock, lotsByProduct, recordMovement } from "@/lib/stock";
import { DATE_RE } from "@/lib/dates";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  return NextResponse.json({
    qty: Object.fromEntries(stockByIngredient(db, hid)),
    byProduct: Object.fromEntries(stockByProduct(db, hid)),
    expiry: Object.fromEntries(expiryByIngredient(db, hid)),
    expiryByProduct: Object.fromEntries(expiryByProduct(db, hid)),
    lotsByProduct: Object.fromEntries(lotsByProduct(db, hid)),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const delta = Number(b?.delta);
  const productId = b?.productId != null ? Number(b.productId) : null;
  const purchaseId = b?.purchaseId != null ? Number(b.purchaseId) : null;
  const expiresAt = typeof b?.expiresAt === "string" && DATE_RE.test(b.expiresAt) ? b.expiresAt : null;
  if (!ingredientId || !Number.isFinite(delta))
    return NextResponse.json({ error: "ingredientId and numeric delta required" }, { status: 400 });
  const hid = session.user.householdId;
  if (purchaseId) {
    // Per-lot correction / zero (trash button): targets the exact lot, no FEFO.
    recordMovement(db, hid, { ingredientId, productId, purchaseId, delta, reason: "manual" });
  } else if (delta !== 0) {
    // Add on-hand (new manual lot) when productId is set; legacy unattributed adjust otherwise.
    const rows = adjustStock(db, hid, ingredientId, delta, expiresAt, productId);
    // Return the new lot's id so the client can set its price (add has no price field).
    if (productId != null && delta > 0) {
      return NextResponse.json({ purchaseId: rows[0]?.purchaseId ?? null }, { status: 201 });
    }
  }
  return new NextResponse(null, { status: 201 });
}
