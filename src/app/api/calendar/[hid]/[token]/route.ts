import { NextResponse } from "next/server";
import { db } from "@/db";
import { agendaDays } from "@/lib/agenda";
import { topUpRules } from "@/lib/rules";
import { buildIcs, calendarTokenValid } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";

// Public ICS feed for calendar apps (TickTick "Subscribe by URL"). No session
// cookie is sent on a subscription fetch, so auth is the per-household token.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hid: string; token: string }> },
) {
  const { hid: hidStr, token: tokenParam } = await params;
  const hid = Number(hidStr);
  const token = tokenParam.replace(/\.ics$/, ""); // TickTick appends nothing, but be forgiving
  if (!Number.isInteger(hid) || !calendarTokenValid(hid, token)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const today = todayISO();
  const to = new Date(Date.parse(today) + 14 * 86_400_000).toISOString().slice(0, 10);
  topUpRules(db, hid, today);
  const ics = buildIcs(agendaDays(db, hid, today, to, today));
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600", // TickTick re-polls; an hour is plenty
    },
  });
}
