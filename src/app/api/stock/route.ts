import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient, stockByProduct, expiryByIngredient, expiryByProduct, adjustStock, lotsByProduct, recordMovement, ownsStockRefs, unattributedPool } from "@/lib/stock";
import { readJson } from "@/lib/validate";

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
  const parsed = await readJson(req, {
    ingredientId: { type: "number", required: true, integer: true, min: 1 },
    delta: { type: "number", required: true },
    productId: { type: "number", integer: true, min: 1 },
    purchaseId: { type: "number", integer: true, min: 1 },
    expiresAt: { type: "date" },
  });
  if (parsed instanceof Response) return parsed;
  const { ingredientId, delta } = parsed;
  const productId = parsed.productId ?? null;
  const purchaseId = parsed.purchaseId ?? null;
  const expiresAt = parsed.expiresAt ?? null;
  const hid = session.user.householdId;
  if (!ownsStockRefs(db, hid, ingredientId, productId, purchaseId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (purchaseId) {
    // Per-lot correction / zero (trash button): targets the exact lot, no FEFO.
    recordMovement(db, hid, { ingredientId, productId, purchaseId, delta, reason: "manual" });
  } else if (delta !== 0) {
    // Unattributed negative adjustments can be swallowed by netStock's floor at 0
    // (see stock.ts) — pre-check so we never silently no-op a write.
    if (productId == null && delta < 0 && unattributedPool(db, hid, ingredientId) + delta < 0) {
      return NextResponse.json(
        { error: "Would drop unattributed stock below zero — not applied" },
        { status: 400 },
      );
    }
    // Add on-hand (new manual lot) when productId is set; legacy unattributed adjust otherwise.
    const rows = adjustStock(db, hid, ingredientId, delta, expiresAt, productId);
    // Return the new lot's id so the client can set its price (add has no price field).
    if (productId != null && delta > 0) {
      return NextResponse.json({ purchaseId: rows[0]?.purchaseId ?? null }, { status: 201 });
    }
  }
  return new NextResponse(null, { status: 201 });
}
