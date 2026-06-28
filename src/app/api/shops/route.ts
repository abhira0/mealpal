import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createShop, listShops } from "@/lib/shops";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listShops(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  const website = body?.website?.trim() || null;
  const iconUrl = body?.iconUrl?.trim() || null;
  return NextResponse.json(createShop(db, session.user.householdId, name, website, iconUrl), { status: 201 });
}
