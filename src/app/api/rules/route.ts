import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createRule, listRules } from "@/lib/rules";
import { todayISO } from "@/lib/dates";

// List every recurring rule for the household (management/debugging view —
// previously there was no way to see created rules other than via the agenda).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listRules(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  // exactly one item kind, mirroring /api/events
  const item = [b?.recipeId, b?.productId, b?.ingredientId].filter((v) => v != null).length;
  if (!b?.slotId || !b?.startDate || item !== 1)
    return NextResponse.json({ error: "slotId, startDate, and exactly one of recipeId/productId/ingredientId required" }, { status: 400 });
  // A direct-ingredient rule needs a positive amount per occurrence — mirrors
  // /api/events, which rejects the same case. Without this, createRule silently
  // stores amount 0 and every materialized occurrence logs zero consumption.
  if (b.ingredientId != null && (!Number.isFinite(Number(b.amount)) || Number(b.amount) <= 0))
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  const unit = b.unit === "day" ? "day" : "week";
  const daysOfWeek = typeof b.daysOfWeek === "string" && /^[01]{7}$/.test(b.daysOfWeek)
    ? b.daysOfWeek : "1111111";
  try {
    const rule = createRule(db, session.user.householdId, todayISO(), {
      slotId: Number(b.slotId),
      recipeId: b.recipeId != null ? Number(b.recipeId) : null,
      productId: b.productId != null ? Number(b.productId) : null,
      variantId: b.variantId != null ? Number(b.variantId) : null,
      ingredientId: b.ingredientId != null ? Number(b.ingredientId) : null,
      amount: b.amount != null ? Number(b.amount) : null,
      servings: Number(b.servings) || 1,
      intervalN: Math.max(1, Number(b.intervalN) || 1),
      unit,
      daysOfWeek,
      startDate: String(b.startDate),
      untilDate: b.untilDate ? String(b.untilDate) : null,
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    // Bad input (slot/recipe/product/variant/ingredient not found in this
    // household) — not a server error.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
