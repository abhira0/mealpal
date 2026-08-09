import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { serveEvent, unserveEvent } from "@/lib/plan";
import { unstockedIngredients } from "@/lib/consumption";

// Mark a meal event served — the one action that counts toward nutrition.
// Depletes stock first when it hasn't been (still 'planned'); a 'cooked'
// event already depleted stock at cook time, so this just flips its status.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const eventId = Number(id);
  const householdId = session.user.householdId;

  // optional { allocations: { [ingredientId]: { productId, variantId } } } from the cook picker
  const body = await req.json().catch(() => null);
  const raw = body?.allocations;
  const allocations = raw && typeof raw === "object"
    ? new Map(Object.entries(raw).map(([k, v]) => {
        const a = v as { productId: number; variantId: number | null };
        return [Number(k), { productId: Number(a.productId), variantId: a.variantId == null ? null : Number(a.variantId) }];
      }))
    : undefined;

  // Block only when this serve is about to deplete stock (still 'planned'),
  // unless the user chose to serve anyway. A 'cooked' event already moved
  // its stock, so serving it just flips status — no fresh check needed.
  const [ev] = db.select({ status: schema.mealEvents.status }).from(schema.mealEvents)
    .where(and(eq(schema.mealEvents.id, eventId), eq(schema.mealEvents.householdId, householdId))).all();
  if (ev?.status === "planned" && !body?.force) {
    const missing = unstockedIngredients(db, householdId, eventId);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Not enough stock: ${missing.join(", ")}`, missing },
        { status: 409 },
      );
    }
  }

  serveEvent(db, householdId, eventId, allocations);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  unserveEvent(db, session.user.householdId, Number(id));
  return NextResponse.json({ ok: true });
}
