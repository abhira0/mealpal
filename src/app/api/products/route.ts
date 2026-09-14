import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import {
  createProduct,
  listAllProducts,
  listProductsForIngredient,
  nextPriorityForIngredient,
  updateProduct,
} from "@/lib/products";
import { dollarsToCents } from "@/lib/money";
import { cacheProductImage } from "@/lib/product-image";

// Products carry a raw ingredientId/shopId with no FK check against household —
// without this, a product could be created pointing at another household's
// ingredient or shop (cross-household reference / data leak).
function ownsIngredient(householdId: number, ingredientId: number): boolean {
  const [row] = db.select({ id: schema.ingredients.id }).from(schema.ingredients)
    .where(and(eq(schema.ingredients.id, ingredientId), eq(schema.ingredients.householdId, householdId))).all();
  return !!row;
}
function ownsShop(householdId: number, shopId: number): boolean {
  const [row] = db.select({ id: schema.shops.id }).from(schema.shops)
    .where(and(eq(schema.shops.id, shopId), eq(schema.shops.householdId, householdId))).all();
  return !!row;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ingredientIdParam = new URL(req.url).searchParams.get("ingredientId");
  if (ingredientIdParam === null) {
    return NextResponse.json(listAllProducts(db, session.user.householdId));
  }
  const ingredientId = Number(ingredientIdParam);
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
  if (!ownsIngredient(session.user.householdId, ingredientId) || !ownsShop(session.user.householdId, shopId)) {
    return NextResponse.json({ error: "Unknown ingredientId or shopId." }, { status: 400 });
  }
  // Optional manual price / importer seed. null = derive from purchases.
  const dollars = b?.dollars !== undefined ? Number(b.dollars) : NaN;
  const priceCents =
    Number.isFinite(dollars) && dollars >= 0 ? dollarsToCents(dollars) : null;
  const row = createProduct(db, session.user.householdId, {
    ingredientId,
    shopId,
    name,
    packSize,
    // priority is set by drag-reorder on the ingredient page, not entered here;
    // a new product lands at the bottom of its ingredient's preference order.
    priority:
      b?.priority !== undefined
        ? Number(b.priority)
        : nextPriorityForIngredient(db, session.user.householdId, ingredientId),
    priceCents,
    url: b?.url?.trim() || null,
    imageUrl: b?.imageUrl?.trim() || null,
    servingSize: b?.servingSize != null ? Number(b.servingSize) : null,
  });
  if (row.imageUrl) {
    const cached = await cacheProductImage(row.id, row.imageUrl);
    if (cached && cached !== row.imageUrl) row.imageUrl = updateProduct(db, session.user.householdId, row.id, { imageUrl: cached })!.imageUrl;
  }
  return NextResponse.json(row, { status: 201 });
}
