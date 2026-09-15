import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { regenerateCalendarToken } from "@/lib/households";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = regenerateCalendarToken(db, session.user.householdId);
  return NextResponse.json({ token });
}
