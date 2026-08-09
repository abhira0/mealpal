import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBatch } from "@/lib/batches";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const batch = getBatch(db, session.user.householdId, Number(id));
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(batch);
}
