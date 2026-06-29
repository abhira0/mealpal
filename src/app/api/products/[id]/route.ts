import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteProduct, updateProduct, NUTRIENT_PATCH_KEYS, type ProductPatch } from "@/lib/products";
import { dollarsToCents } from "@/lib/money";

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
  const row = updateProduct(db, session.user.householdId, Number(id), {
    ...(b?.ingredientId !== undefined ? { ingredientId: Number(b.ingredientId) } : {}),
    ...(b?.shopId !== undefined ? { shopId: Number(b.shopId) } : {}),
    ...(b?.name !== undefined ? { name: String(b.name).trim() } : {}),
    ...(b?.packSize !== undefined ? { packSize: Number(b.packSize) } : {}),
    ...(b?.priority !== undefined ? { priority: Number(b.priority) } : {}),
    ...(pricePatch(b) ?? {}),
    ...(b?.available !== undefined ? { available: Boolean(b.available) } : {}),
    ...(b?.url !== undefined ? { url: b.url === null ? null : String(b.url).trim() || null } : {}),
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
