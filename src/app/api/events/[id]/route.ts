import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteEvent, getEvent, updateEvent, type DeleteScope, type EventInput } from "@/lib/plan";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ev = getEvent(db, session.user.householdId, Number(id));
  if (!ev) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(ev);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as Partial<EventInput> | null;
  if (!b || !b.date || typeof b.slotId !== "number") {
    return NextResponse.json({ error: "date, slotId required" }, { status: 400 });
  }
  const row = updateEvent(db, session.user.householdId, Number(id), {
    date: b.date, slotId: b.slotId, servings: b.servings ?? 1,
    recipeId: b.recipeId ?? null, ingredientId: b.ingredientId ?? null,
    productId: b.productId ?? null, variantId: b.variantId ?? null, amount: b.amount ?? null,
  });
  if (!row) return NextResponse.json({ error: "only planned meals can be edited" }, { status: 409 });
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const raw = new URL(req.url).searchParams.get("scope");
  const scope: DeleteScope = raw === "following" || raw === "all" ? raw : "one";
  deleteEvent(db, session.user.householdId, Number(id), scope);
  return NextResponse.json({ ok: true });
}
