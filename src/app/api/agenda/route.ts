import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { agendaDays, nextCooks } from "@/lib/agenda";
import { topUpRules } from "@/lib/rules";
import { todayISO } from "@/lib/dates";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const today = url.searchParams.get("today") ?? todayISO();
  if (!from || !to) return NextResponse.json({ error: "from & to required" }, { status: 400 });
  topUpRules(db, session.user.householdId, todayISO());
  return NextResponse.json({
    days: agendaDays(db, session.user.householdId, from, to, today),
    nextCooks: nextCooks(db, session.user.householdId, today),
  });
}
