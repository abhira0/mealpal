import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBatch, packBatch, unpackBatch, type PackBatchInput } from "@/lib/batches";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const batch = getBatch(db, session.user.householdId, Number(id));
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(batch);
}

// Edit = full re-pack: restore the old batch's stock, then pack a fresh one from
// the new input (new id). Discards the old batch's eaten history.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as Partial<PackBatchInput> | null;
  if (!b || typeof b.slotId !== "number" || !b.label?.trim() || typeof b.mealsTotal !== "number" || b.mealsTotal < 1) {
    return NextResponse.json({ error: "slotId, label, mealsTotal required" }, { status: 400 });
  }
  const batch = db.transaction(() => {
    const ok = unpackBatch(db, session.user.householdId, Number(id));
    if (!ok) return null;
    return packBatch(db, session.user.householdId, {
      slotId: b.slotId!, label: b.label!.trim(),
      cookedDate: b.cookedDate ?? new Date().toISOString().slice(0, 10),
      mealsTotal: b.mealsTotal!, items: Array.isArray(b.items) ? b.items : [],
    });
  });
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(batch);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = unpackBatch(db, session.user.householdId, Number(id));
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
