import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { cookEvent, uncookEvent } from "@/lib/plan";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  cookEvent(db, session.user.householdId, Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  uncookEvent(db, session.user.householdId, Number(id));
  return NextResponse.json({ ok: true });
}
