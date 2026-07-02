import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dayNutrition } from "@/lib/nutrition";
import { DATE_RE } from "@/lib/dates";

// GET /api/nutrition?date=YYYY-MM-DD — per-meal nutrition + day total.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return NextResponse.json(dayNutrition(db, session.user.householdId, date));
}
