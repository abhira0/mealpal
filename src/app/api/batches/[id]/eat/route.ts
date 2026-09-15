import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { eatFromBatch, uneatFromBatch, getBatch } from "@/lib/batches";
import { todayISO } from "@/lib/dates";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? todayISO();
  const result = eatFromBatch(db, session.user.householdId, Number(id), date);
  if (result === "empty") {
    return NextResponse.json({ error: "No meals remaining in this batch" }, { status: 409 });
  }
  return NextResponse.json(getBatch(db, session.user.householdId, Number(id)));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? todayISO();
  uneatFromBatch(db, session.user.householdId, Number(id), date);
  return NextResponse.json(getBatch(db, session.user.householdId, Number(id)));
}
