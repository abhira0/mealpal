import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { inspectEvent } from "@/lib/inspect";

// Composite read for the Plan inspector: event details + stock impact + macros.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = inspectEvent(db, session.user.householdId, Number(id));
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
