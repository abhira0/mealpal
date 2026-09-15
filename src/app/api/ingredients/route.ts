import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createIngredient, listIngredients } from "@/lib/ingredients";
import { CANONICAL_UNITS } from "@/lib/units";
import { readJson } from "@/lib/validate";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listIngredients(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req, {
    name: { type: "string", required: true, trim: true },
    canonicalUnit: { type: "enum", values: CANONICAL_UNITS, required: true },
  });
  if (parsed instanceof Response) return parsed;
  const row = createIngredient(db, session.user.householdId, {
    name: parsed.name,
    canonicalUnit: parsed.canonicalUnit,
  });
  return NextResponse.json(row, { status: 201 });
}
