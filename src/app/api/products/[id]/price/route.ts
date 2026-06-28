import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addPrice } from "@/lib/products";
import { dollarsToCents } from "@/lib/money";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  // accept either {cents} or {dollars}
  const cents =
    b?.cents !== undefined ? Number(b.cents) : b?.dollars !== undefined ? dollarsToCents(Number(b.dollars)) : NaN;
  if (!Number.isFinite(cents) || cents < 0) {
    return NextResponse.json({ error: "Provide cents or dollars >= 0." }, { status: 400 });
  }
  const observedAt = b?.observedAt ? new Date(b.observedAt) : undefined;
  return NextResponse.json(addPrice(db, Number(id), Math.round(cents), observedAt), {
    status: 201,
  });
}
