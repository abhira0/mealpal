import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dayIngredientTable, weekIngredientTable, mondayOf } from "@/lib/nutrition";

// GET /api/nutrition/ingredients?mode=day|week&date=YYYY-MM-DD — per-ingredient actual usage.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  const basis = req.nextUrl.searchParams.get("basis") === "planned" ? "planned" : "served";
  const eventIdsParam = req.nextUrl.searchParams.get("eventIds");
  const eventIds = eventIdsParam ? eventIdsParam.split(",").map(Number) : undefined;
  const rows = req.nextUrl.searchParams.get("mode") === "week"
    ? weekIngredientTable(db, hid, mondayOf(date), basis)
    : dayIngredientTable(db, hid, date, basis, eventIds);
  return NextResponse.json(rows);
}
