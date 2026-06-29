import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stockByIngredient } from "@/lib/stock";
import { plannedConsumption, runOutDates } from "@/lib/plan";
import { buyRecommendation, learnedShelfLife } from "@/lib/shopping";

function urgency(runOut: string | undefined, from: string) {
  if (!runOut) return null;
  const daysOut = Math.round((Date.parse(runOut) - Date.parse(from)) / 86_400_000);
  if (daysOut <= 0) return { label: "out now", tone: "run" as const };
  return { label: `out in ${daysOut}d`, tone: daysOut <= 3 ? ("run" as const) : ("low" as const) };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const sp = new URL(req.url).searchParams;
  const horizon = Math.min(90, Math.max(1, Number(sp.get("horizon")) || 14));
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10);
  const stock = stockByIngredient(db, hid);
  const target = plannedConsumption(db, hid, from, to, learnedShelfLife(db, hid));
  const grouped = buyRecommendation(db, hid, stock, target);
  const runOut = runOutDates(db, hid, from, to, stock);
  for (const lines of grouped.values())
    for (const line of lines) (line as typeof line & { urgency?: unknown }).urgency = urgency(runOut.get(line.ingredientId), from);
  return NextResponse.json(Object.fromEntries(grouped));
}
