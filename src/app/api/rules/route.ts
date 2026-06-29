import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createRule } from "@/lib/rules";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.slotId || !b?.recipeId || !b?.startDate)
    return NextResponse.json({ error: "slotId, recipeId, startDate required" }, { status: 400 });
  const unit = b.unit === "day" ? "day" : "week";
  const daysOfWeek = typeof b.daysOfWeek === "string" && /^[01]{7}$/.test(b.daysOfWeek)
    ? b.daysOfWeek : "1111111";
  const rule = createRule(db, session.user.householdId, today(), {
    slotId: Number(b.slotId),
    recipeId: Number(b.recipeId),
    servings: Number(b.servings) || 1,
    intervalN: Math.max(1, Number(b.intervalN) || 1),
    unit,
    daysOfWeek,
    startDate: String(b.startDate),
    untilDate: b.untilDate ? String(b.untilDate) : null,
  });
  return NextResponse.json(rule, { status: 201 });
}
