import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { cookEvent, uncookEvent } from "@/lib/plan";
import { cookChoices } from "@/lib/consumption";

// Which ingredients need the user to pick a product before cooking (>1 in stock).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(cookChoices(db, session.user.householdId, Number(id)));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // optional { allocations: { [ingredientId]: productId } } from the cook picker
  const body = await req.json().catch(() => null);
  const raw = body?.allocations;
  const allocations = raw && typeof raw === "object"
    ? new Map(Object.entries(raw).map(([k, v]) => [Number(k), Number(v)]))
    : undefined;
  cookEvent(db, session.user.householdId, Number(id), allocations);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  uncookEvent(db, session.user.householdId, Number(id));
  return NextResponse.json({ ok: true });
}
