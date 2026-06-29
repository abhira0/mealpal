import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { schema } from "@/db";
import { addEvent, listEvents } from "@/lib/plan";
import { listVariants } from "@/lib/variants";
import { topUpRules } from "@/lib/rules";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "0000-01-01";
  const to = sp.get("to") ?? "9999-12-31";
  topUpRules(db, session.user.householdId, today());
  return NextResponse.json(listEvents(db, session.user.householdId, from, to));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const b = await req.json().catch(() => null);
  if (!b?.date || !b?.slotId)
    return NextResponse.json({ error: "date and slotId required" }, { status: 400 });

  // Exactly one kind: recipe meal, direct ingredient, or direct product.
  const set = (v: unknown) => v != null && v !== "";
  if ([b?.recipeId, b?.ingredientId, b?.productId].filter(set).length !== 1)
    return NextResponse.json({ error: "provide exactly one of recipeId, ingredientId, productId" }, { status: 400 });

  const base = { date: String(b.date), slotId: Number(b.slotId), servings: Number(b.servings) || 1 };

  if (set(b.recipeId))
    return NextResponse.json(addEvent(db, hid, { ...base, recipeId: Number(b.recipeId) }), { status: 201 });

  if (set(b.ingredientId)) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    return NextResponse.json(addEvent(db, hid, { ...base, ingredientId: Number(b.ingredientId), amount }), { status: 201 });
  }

  // product item — assorted products require a variant (their own nutrition is empty)
  const productId = Number(b.productId);
  const [product] = db.select().from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.householdId, hid))).all();
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });
  const variants = listVariants(db, hid, productId);
  let variantId: number | null = null;
  if (set(b.variantId)) {
    variantId = Number(b.variantId);
    if (!variants.some((v) => v.id === variantId))
      return NextResponse.json({ error: "variant not found for this product" }, { status: 400 });
  } else if (variants.length > 0) {
    return NextResponse.json({ error: "this product is assorted — pick a variant" }, { status: 400 });
  }
  return NextResponse.json(addEvent(db, hid, { ...base, productId, variantId }), { status: 201 });
}
