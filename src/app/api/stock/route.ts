import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, stockByProduct, expiryByIngredient, expiryByProduct, adjustStock, replaceManualExpiry } from "@/lib/stock";
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
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const delta = Number(b?.delta);
  const productId = b?.productId != null ? Number(b.productId) : null;
  const expiresAt = typeof b?.expiresAt === "string" && DATE_RE.test(b.expiresAt) ? b.expiresAt : null;
  if (!ingredientId || !Number.isFinite(delta))
    return NextResponse.json({ error: "ingredientId and numeric delta required" }, { status: 400 });
  const hid = session.user.householdId;
  // A real quantity change records a movement (no date — the pantry keeps ONE
  // editable manual expiry, set below). An expiry edit REPLACES that date in
  // place rather than piling on a new dated row that min() would ignore.
  if (delta !== 0) adjustStock(db, hid, ingredientId, delta, null, productId);
  if (expiresAt) replaceManualExpiry(db, hid, ingredientId, productId, expiresAt);
  return new NextResponse(null, { status: 201 });
}
