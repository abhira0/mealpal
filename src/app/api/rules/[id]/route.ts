import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteRule } from "@/lib/rules";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const keepGenerated = new URL(req.url).searchParams.get("keepGenerated") === "true";
  deleteRule(db, session.user.householdId, Number(id), keepGenerated);
  return NextResponse.json({ ok: true });
}
