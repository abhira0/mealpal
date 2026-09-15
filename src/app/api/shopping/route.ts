import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { shoppingList } from "@/lib/shopping";
import { parseHorizon } from "@/lib/api-params";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const horizon = parseHorizon(new URL(req.url).searchParams.get("horizon"));
  if (horizon === "invalid")
    return NextResponse.json({ error: "horizon must be between 1 and 90" }, { status: 400 });
  return NextResponse.json(
    Object.fromEntries(shoppingList(db, session.user.householdId, horizon)),
  );
}
