import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteSlot, updateSlot } from "@/lib/slots";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  const row = updateSlot(db, session.user.householdId, Number(id), {
    name,
    ...(body?.timeOfDay !== undefined ? { timeOfDay: String(body.timeOfDay) || "12:00" } : {}),
    ...(body?.prepStart !== undefined ? { prepStart: body.prepStart ? String(body.prepStart) : null } : {}),
    ...(body?.prepEnd !== undefined ? { prepEnd: body.prepEnd ? String(body.prepEnd) : null } : {}),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = deleteSlot(db, session.user.householdId, Number(id));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  if (!result.deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
