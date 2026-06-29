import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dayNutrition } from "@/lib/nutrition";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/nutrition?date=YYYY-MM-DD — per-meal nutrition + day total.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return NextResponse.json(dayNutrition(db, session.user.householdId, date));
}
