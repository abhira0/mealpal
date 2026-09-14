import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteRule, updateRuleRecurrence } from "@/lib/rules";
import { todayISO } from "@/lib/dates";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const keepGenerated = new URL(req.url).searchParams.get("keepGenerated") === "true";
  deleteRule(db, session.user.householdId, Number(id), keepGenerated);
  return NextResponse.json({ ok: true });
}

// Edit a live rule's recurrence. Future planned occurrences are regenerated on
// the new cadence; cooked/served history is untouched.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const unit = b?.unit === "day" ? "day" : "week";
  const daysOfWeek = typeof b?.daysOfWeek === "string" && /^[01]{7}$/.test(b.daysOfWeek) ? b.daysOfWeek : "1111111";
  if (unit === "week" && !daysOfWeek.includes("1"))
    return NextResponse.json({ error: "pick at least one day of the week" }, { status: 400 });
  const rule = updateRuleRecurrence(db, session.user.householdId, Number(id), todayISO(), {
    intervalN: Math.max(1, Number(b?.intervalN) || 1),
    unit,
    daysOfWeek,
    untilDate: b?.untilDate ? String(b.untilDate) : null,
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rule);
}
