import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { shoppingList } from "@/lib/shopping";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const horizon = Number(new URL(req.url).searchParams.get("horizon")) || 14;
  return NextResponse.json(
    Object.fromEntries(shoppingList(db, session.user.householdId, horizon)),
  );
}
