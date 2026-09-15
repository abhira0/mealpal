import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createSlot, isValidTimeOfDay, listSlots } from "@/lib/slots";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listSlots(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const timeOfDay = b.timeOfDay ? String(b.timeOfDay) : "";
  if (timeOfDay && !isValidTimeOfDay(timeOfDay)) {
    return NextResponse.json({ error: "timeOfDay must be in HH:MM (24h) format" }, { status: 400 });
  }
  return NextResponse.json(
    createSlot(db, session.user.householdId, String(b.name).trim(), timeOfDay || "12:00"),
    { status: 201 });
}
