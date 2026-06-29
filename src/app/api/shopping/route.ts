import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient } from "@/lib/stock";
import { plannedConsumption } from "@/lib/plan";
import { buyRecommendation, learnedShelfLife } from "@/lib/shopping";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const sp = new URL(req.url).searchParams;
  const horizon = Math.min(60, Math.max(1, Number(sp.get("horizon")) || 14));
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10);
  const stock = stockByIngredient(db, hid);
  const target = plannedConsumption(db, hid, from, to, learnedShelfLife(db, hid));
  const grouped = buyRecommendation(db, hid, stock, target);
  return NextResponse.json(Object.fromEntries(grouped));
}
