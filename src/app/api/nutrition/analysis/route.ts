import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  dayNutrition, weekNutrition, mondayOf, getGoals, scorecards, macroSplit,
} from "@/lib/nutrition";

// GET /api/nutrition/analysis?mode=day|week&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  const mode = req.nextUrl.searchParams.get("mode") === "week" ? "week" : "day";

  const goals = getGoals(db, hid);

  if (mode === "week") {
    const monday = mondayOf(date);
    const week = weekNutrition(db, hid, monday);
    return NextResponse.json({
      mode, goals, monday: week.monday, nutrients: week.average,
      macros: macroSplit(week.average),
      perDay: week.perDay, daysWithMeals: week.daysWithMeals,
      scorecards: scorecards(week.average), missing: week.missing,
    });
  }

  const day = dayNutrition(db, hid, date);
  return NextResponse.json({
    mode, goals, date, nutrients: day.total,
    macros: macroSplit(day.total),
    meals: day.meals.map((m) => ({
      slotName: m.slotName, recipeName: m.recipeName,
      estimate: m.estimate, calories: m.nutrients.calories,
    })),
    scorecards: scorecards(day.total), missing: day.missing,
  });
}
