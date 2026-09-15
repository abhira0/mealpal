import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { eatFromBatch, uneatFromBatch, getBatch } from "@/lib/batches";
import { DATE_RE, todayISO } from "@/lib/dates";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? todayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  eatFromBatch(db, session.user.householdId, Number(id), date);
  const batch = getBatch(db, session.user.householdId, Number(id));
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(batch);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? todayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  uneatFromBatch(db, session.user.householdId, Number(id), date);
  const batch = getBatch(db, session.user.householdId, Number(id));
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(batch);
}
