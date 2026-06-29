import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dayIngredientTable } from "@/lib/nutrition";

// GET /api/nutrition/ingredients?date=YYYY-MM-DD — per-ingredient actual usage for the day.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  return NextResponse.json(dayIngredientTable(db, session.user.householdId, date));
}
