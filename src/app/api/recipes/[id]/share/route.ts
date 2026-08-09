import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { setShared } from "@/lib/recipes";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const token = setShared(db, session.user.householdId, Number(id), !!b?.enabled);
  return NextResponse.json({ token });
}
