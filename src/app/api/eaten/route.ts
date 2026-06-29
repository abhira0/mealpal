import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { logEaten, listEaten } from "@/lib/eaten";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return NextResponse.json(listEaten(db, session.user.householdId, date));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = Number(b?.productId);
  const date = b?.date;
  if (!productId || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "productId and date=YYYY-MM-DD required" }, { status: 400 });
  const row = logEaten(db, session.user.householdId, {
    date, productId,
    variantId: b?.variantId != null && b.variantId !== "" ? Number(b.variantId) : null,
    count: b?.count != null ? Number(b.count) : 1,
  });
  return NextResponse.json(row, { status: 201 });
}
