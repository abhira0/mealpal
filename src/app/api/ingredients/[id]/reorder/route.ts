import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { reorderProducts } from "@/lib/products";

// POST { orderedIds: number[] } — persist a drag-reorder of this ingredient's
// products as priority 1..N. Atomic; ids outside the household are ignored.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const orderedIds = Array.isArray(body?.orderedIds)
    ? body.orderedIds.map(Number).filter(Number.isFinite)
    : null;
  if (!orderedIds) {
    return NextResponse.json({ error: "orderedIds array required." }, { status: 400 });
  }
  reorderProducts(db, session.user.householdId, Number(id), orderedIds);
  return NextResponse.json({ ok: true });
}
