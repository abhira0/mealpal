import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { nextCooks } from "@/lib/agenda";
import { topUpRules } from "@/lib/rules";
import { buildIcs, calendarTokenMatches, DEFAULT_TIMEZONE } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";

// Mirrors TodayAgenda's "🍳 Next cooking" filter — only these prep cards show.
// ponytail: hardcoded to what the user cares about; keep in sync with TodayAgenda.
const isVisibleCook = (c: { slotName: string; label: string }) =>
  c.slotName === "Lunch" ||
  c.slotName === "Dinner" ||
  c.label.toLowerCase().includes("overnight oats");

// Public ICS feed for calendar apps (TickTick "Subscribe by URL"). No session
// cookie is sent on a subscription fetch, so auth is the per-household token.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hid: string; token: string }> },
) {
  const { hid: hidStr, token: tokenParam } = await params;
  const hid = Number(hidStr);
  const token = tokenParam.replace(/\.ics$/, ""); // TickTick appends nothing, but be forgiving
  const household = Number.isInteger(hid)
    ? db.select().from(schema.households).where(eq(schema.households.id, hid)).get()
    : undefined;
  if (!household || !calendarTokenMatches(household.calendarToken, token)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const today = todayISO();
  topUpRules(db, hid, today);
  const ics = buildIcs(nextCooks(db, hid, today).filter(isVisibleCook), household.timezone ?? DEFAULT_TIMEZONE);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600", // TickTick re-polls; an hour is plenty
    },
  });
}
