import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { deleteProduct, updateProduct, NUTRIENT_PATCH_KEYS, type ProductPatch } from "@/lib/products";
import { dollarsToCents } from "@/lib/money";
import { cacheProductImage } from "@/lib/product-image";

// Same cross-household guard as POST /api/products — a PATCH can reassign a
// product to a different ingredient/shop, so it needs the same check.
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

// Pull any nutrient fields present in the body into a patch (per canonical unit).
// Accepts numbers and null (clears). Ignores absent keys.
function nutrientPatch(b: Record<string, unknown>): ProductPatch {
  const patch: ProductPatch = {};
  for (const k of NUTRIENT_PATCH_KEYS) {
    if (b?.[k] === undefined) continue;
    patch[k] = b[k] === null ? null : Number(b[k]);
  }
  return patch;
}

// Resolve a manual price patch from {dollars} (form) or {priceCents}.
// Empty/null clears the override (price then derives from purchases).
function pricePatch(b: Record<string, unknown>): { priceCents: number | null } | undefined {
  if (b?.priceCents !== undefined)
    return { priceCents: b.priceCents === null ? null : Number(b.priceCents) };
  if (b?.dollars === undefined) return undefined;
  const d = Number(b.dollars);
  return { priceCents: b.dollars === "" || b.dollars === null || !Number.isFinite(d) ? null : dollarsToCents(d) };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (b?.ingredientId !== undefined && !ownsIngredient(session.user.householdId, Number(b.ingredientId))) {
    return NextResponse.json({ error: "Unknown ingredientId." }, { status: 400 });
  }
  if (b?.shopId !== undefined && !ownsShop(session.user.householdId, Number(b.shopId))) {
    return NextResponse.json({ error: "Unknown shopId." }, { status: 400 });
  }
  if (b?.packSize !== undefined && !(Number(b.packSize) > 0)) {
    return NextResponse.json({ error: "packSize must be a positive number." }, { status: 400 });
  }
  const trimmedImageUrl = b?.imageUrl == null ? null : String(b.imageUrl).trim() || null;
  const imageUrl =
    b?.imageUrl !== undefined
      ? (trimmedImageUrl === null ? null : (await cacheProductImage(Number(id), trimmedImageUrl)) ?? trimmedImageUrl)
      : undefined;
  const row = updateProduct(db, session.user.householdId, Number(id), {
    ...(b?.ingredientId !== undefined ? { ingredientId: Number(b.ingredientId) } : {}),
    ...(b?.shopId !== undefined ? { shopId: Number(b.shopId) } : {}),
    ...(b?.name !== undefined ? { name: String(b.name).trim() } : {}),
    ...(b?.packSize !== undefined ? { packSize: Number(b.packSize) } : {}),
    ...(b?.servingSize !== undefined ? { servingSize: b.servingSize === null || b.servingSize === "" ? null : Number(b.servingSize) } : {}),
    ...(b?.priority !== undefined ? { priority: Number(b.priority) } : {}),
    ...(pricePatch(b) ?? {}),
    ...(b?.available !== undefined ? { available: Boolean(b.available) } : {}),
    ...(b?.url !== undefined ? { url: b.url === null ? null : String(b.url).trim() || null } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(b?.nutritionPhotoSkipped !== undefined ? { nutritionPhotoSkipped: Boolean(b.nutritionPhotoSkipped) } : {}),
    ...nutrientPatch(b),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = deleteProduct(db, session.user.householdId, Number(id));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  if (!result.deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
