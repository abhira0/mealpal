import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { logEaten, listEaten } from "@/lib/eaten";
import { DATE_RE } from "@/lib/dates";
import { readJson } from "@/lib/validate";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return NextResponse.json(listEaten(db, session.user.householdId, date));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await readJson(req, {
    productId: { type: "number", required: true, integer: true, min: 1 },
    date: { type: "date", required: true },
    variantId: { type: "number", integer: true, min: 1 },
    count: { type: "number" },
  });
  if (b instanceof Response) return b;
  try {
    const row = logEaten(db, session.user.householdId, {
      date: b.date, productId: b.productId,
      variantId: b.variantId ?? null,
      count: b.count ?? 1,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    // Bad input (product/variant not found in this household, or a
    // variantId that belongs to a different product) — not a server error.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
