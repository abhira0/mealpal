import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { listBatches, packBatch, type PackBatchInput } from "@/lib/batches";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listBatches(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Partial<PackBatchInput> | null;
  if (!b || typeof b.slotId !== "number" || !b.label?.trim() || typeof b.mealsTotal !== "number" || b.mealsTotal < 1) {
    return NextResponse.json({ error: "slotId, label, mealsTotal required" }, { status: 400 });
  }
  const batch = packBatch(db, session.user.householdId, {
    slotId: b.slotId, label: b.label.trim(), cookedDate: b.cookedDate ?? new Date().toISOString().slice(0, 10),
    mealsTotal: b.mealsTotal, items: Array.isArray(b.items) ? b.items : [],
  });
  return NextResponse.json(batch, { status: 201 });
}
