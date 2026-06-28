import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addEvent, listEvents } from "@/lib/plan";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "0000-01-01";
  const to = sp.get("to") ?? "9999-12-31";
  return NextResponse.json(listEvents(db, session.user.householdId, from, to));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.date || !b?.slotId || !b?.recipeId)
    return NextResponse.json({ error: "date, slotId, recipeId required" }, { status: 400 });
  return NextResponse.json(
    addEvent(db, session.user.householdId, {
      date: String(b.date), slotId: Number(b.slotId), recipeId: Number(b.recipeId),
      servings: Number(b.servings) || 1,
    }), { status: 201 });
}
