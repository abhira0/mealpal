import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createProduct, listProductsForIngredient } from "@/lib/products";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ingredientId = Number(new URL(req.url).searchParams.get("ingredientId"));
  if (!ingredientId)
    return NextResponse.json({ error: "ingredientId query param required." }, { status: 400 });
  return NextResponse.json(
    listProductsForIngredient(db, session.user.householdId, ingredientId),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ingredientId = Number(b?.ingredientId);
  const shopId = Number(b?.shopId);
  const name = b?.name?.trim();
  const packSize = Number(b?.packSize);
  if (!ingredientId || !shopId || !name || !packSize || packSize <= 0) {
    return NextResponse.json(
      { error: "ingredientId, shopId, name, and a positive packSize are required." },
      { status: 400 },
    );
  }
  const row = createProduct(db, session.user.householdId, {
    ingredientId,
    shopId,
    branchId: b?.branchId ? Number(b.branchId) : null,
    name,
    packSize,
    priority: b?.priority !== undefined ? Number(b.priority) : 100,
    url: b?.url?.trim() || null,
  });
  return NextResponse.json(row, { status: 201 });
}
