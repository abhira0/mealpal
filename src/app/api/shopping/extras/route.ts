import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addExtra } from "@/lib/shopping";

// Add a manual shopping line: either a tracked product, or a one-off free-text title.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const productId = b?.productId ? Number(b.productId) : null;
  const title = typeof b?.title === "string" ? b.title.trim() : null;
  const shopId = b?.shopId ? Number(b.shopId) : null;
  const quantity = Number(b?.quantity) || 1;
  if (!productId && !title)
    return NextResponse.json({ error: "productId or title required" }, { status: 400 });
  return NextResponse.json(
    addExtra(db, session.user.householdId, { productId, title, shopId, quantity }),
    { status: 201 });
}
