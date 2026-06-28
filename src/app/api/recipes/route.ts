import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createRecipe, listRecipes } from "@/lib/recipes";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listRecipes(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const row = createRecipe(db, session.user.householdId, {
    name: String(b.name).trim(),
    baseServings: Number(b.baseServings) || 1,
    notes: b.notes?.trim() || null,
    ingredients: Array.isArray(b.ingredients)
      ? b.ingredients.map((i: { ingredientId: number; amount: number }) => ({ ingredientId: Number(i.ingredientId), amount: Number(i.amount) }))
      : [],
    steps: Array.isArray(b.steps) ? b.steps.map((s: string) => String(s)) : [],
    media: Array.isArray(b.media)
      ? b.media.map((m: { kind: string; url: string }) => ({ kind: String(m.kind), url: String(m.url) }))
      : [],
  });
  return NextResponse.json(row, { status: 201 });
}
