import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient } from "@/lib/stock";
import { plannedConsumption } from "@/lib/plan";
import { buyRecommendation } from "@/lib/shopping";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = sp.get("to") ?? "9999-12-31";
  const stock = stockByIngredient(db, hid);
  const target = plannedConsumption(db, hid, from, to);
  const grouped = buyRecommendation(db, hid, stock, target);
  return NextResponse.json(Object.fromEntries(grouped));
}
