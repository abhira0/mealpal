import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createIngredient, listIngredients } from "@/lib/ingredients";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listIngredients(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const canonicalUnit = body?.canonicalUnit?.trim();
  if (!name || !["g", "ml", "oz", "count"].includes(canonicalUnit)) {
    return NextResponse.json(
      { error: "name and a canonicalUnit of g/ml/oz/count are required." },
      { status: 400 },
    );
  }
  const row = createIngredient(db, session.user.householdId, {
    name,
    canonicalUnit,
  });
  return NextResponse.json(row, { status: 201 });
}
