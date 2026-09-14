import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { deleteEvent, getEvent, updateEvent, type DeleteScope, type EventInput } from "@/lib/plan";

// Same cross-household guard as POST /api/events — an edit can reassign the
// event's slot/recipe, so a foreign id could otherwise be smuggled in here too.
function ownsSlot(householdId: number, slotId: number): boolean {
  const [row] = db.select({ id: schema.mealSlots.id }).from(schema.mealSlots)
    .where(and(eq(schema.mealSlots.id, slotId), eq(schema.mealSlots.householdId, householdId))).all();
  return !!row;
}
function ownsRecipe(householdId: number, recipeId: number): boolean {
  const [row] = db.select({ id: schema.recipes.id }).from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, householdId))).all();
  return !!row;
}

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
  if (!ownsSlot(session.user.householdId, b.slotId)) {
    return NextResponse.json({ error: "slot not found" }, { status: 404 });
  }
  if (b.recipeId != null && !ownsRecipe(session.user.householdId, b.recipeId)) {
    return NextResponse.json({ error: "recipe not found" }, { status: 404 });
  }
  const rawScope = new URL(req.url).searchParams.get("scope");
  const scope: DeleteScope = rawScope === "following" || rawScope === "all" ? rawScope : "one";
  const row = updateEvent(db, session.user.householdId, Number(id), {
    date: b.date, slotId: b.slotId, servings: b.servings ?? 1,
    recipeId: b.recipeId ?? null, ingredientId: b.ingredientId ?? null,
    productId: b.productId ?? null, variantId: b.variantId ?? null, amount: b.amount ?? null,
  }, scope);
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
