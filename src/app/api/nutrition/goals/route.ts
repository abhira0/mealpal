import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getGoals, setGoals, type Goals } from "@/lib/nutrition";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getGoals(db, session.user.householdId));
}

// PUT /api/nutrition/goals — upsert the household's calorie + macro targets.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const keys = ["calorieGoal", "proteinG", "carbsG", "fatG"] as const;
  const g = {} as Goals;
  for (const k of keys) {
    const v = Math.round(Number(b?.[k]));
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: `invalid ${k}` }, { status: 400 });
    g[k] = v;
  }
  return NextResponse.json(setGoals(db, session.user.householdId, g));
}
