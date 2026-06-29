import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { ingredientNutritionTable } from "@/lib/nutrition";

// GET /api/nutrition/ingredients — per-ingredient nutrition (per 100 units).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(ingredientNutritionTable(db, session.user.householdId));
}
