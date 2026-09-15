import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBatch, packBatch, unpackBatch } from "@/lib/batches";
import { todayISO } from "@/lib/dates";
import { validate } from "@/lib/validate";

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
  const b = await req.json().catch(() => null);
  const parsed = validate(b, {
    slotId: { type: "number", required: true, integer: true, min: 1 },
    label: { type: "string", required: true, trim: true },
    mealsTotal: { type: "number", required: true, min: 1 },
    // previously unchecked — a malformed cookedDate would silently corrupt the
    // batch's shelf-life/history ordering, same risk DATE_RE guards elsewhere.
    cookedDate: { type: "date" },
  });
  if (parsed instanceof Response) return parsed;
  try {
    const batch = db.transaction(() => {
      const ok = unpackBatch(db, session.user.householdId, Number(id));
      if (!ok) return null;
      return packBatch(db, session.user.householdId, {
        slotId: parsed.slotId, label: parsed.label,
        cookedDate: parsed.cookedDate ?? todayISO(),
        mealsTotal: parsed.mealsTotal, items: Array.isArray(b?.items) ? b.items : [],
      });
    });
    if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(batch);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalid batch" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = unpackBatch(db, session.user.householdId, Number(id));
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
