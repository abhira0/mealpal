import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteRecipe, getRecipe, updateRecipe } from "@/lib/recipes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const recipe = getRecipe(db, session.user.householdId, Number(id));
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const row = updateRecipe(db, session.user.householdId, Number(id), {
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
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(getRecipe(db, session.user.householdId, Number(id)));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = deleteRecipe(db, session.user.householdId, Number(id));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  if (!result.deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
