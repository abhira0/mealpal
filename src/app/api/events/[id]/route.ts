import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteEvent, type DeleteScope } from "@/lib/plan";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const raw = new URL(req.url).searchParams.get("scope");
  const scope: DeleteScope = raw === "following" || raw === "all" ? raw : "one";
  deleteEvent(db, session.user.householdId, Number(id), scope);
  return NextResponse.json({ ok: true });
}
