import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createBranch, listBranches } from "@/lib/shops";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const shopId = Number(new URL(req.url).searchParams.get("shopId"));
  if (!shopId) return NextResponse.json({ error: "shopId query param required." }, { status: 400 });
  return NextResponse.json(listBranches(db, session.user.householdId, shopId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const shopId = Number(body?.shopId);
  const name = body?.name?.trim();
  if (!shopId || !name)
    return NextResponse.json({ error: "shopId and name are required." }, { status: 400 });
  return NextResponse.json(
    createBranch(db, session.user.householdId, shopId, name),
    { status: 201 },
  );
}
