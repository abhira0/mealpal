import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { deleteRule, updateRuleRecurrence } from "@/lib/rules";
import { todayISO } from "@/lib/dates";
import { validate } from "@/lib/validate";

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
  // Previously unit/intervalN/untilDate were never actually rejected — an
  // invalid unit silently fell back to "week", a bad intervalN to 1, and a
  // malformed untilDate was stored as-is (matchingDates() then silently
  // compares a NaN timestamp and the rule never materializes anything).
  const parsed = validate(b, {
    unit: { type: "enum", values: ["day", "week"] as const },
    intervalN: { type: "number", integer: true, min: 1 },
    untilDate: { type: "date" },
  });
  if (parsed instanceof Response) return parsed;
  const unit = parsed.unit ?? "week";
  if (b?.daysOfWeek !== undefined && !(typeof b.daysOfWeek === "string" && /^[01]{7}$/.test(b.daysOfWeek)))
    return NextResponse.json({ error: "daysOfWeek must be a 7-character string of 0s and 1s" }, { status: 400 });
  const daysOfWeek = b?.daysOfWeek ?? "1111111";
  if (unit === "week" && !daysOfWeek.includes("1"))
    return NextResponse.json({ error: "pick at least one day of the week" }, { status: 400 });
  const rule = updateRuleRecurrence(db, session.user.householdId, Number(id), todayISO(), {
    intervalN: parsed.intervalN ?? 1,
    unit,
    daysOfWeek,
    untilDate: parsed.untilDate ?? null,
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rule);
}
