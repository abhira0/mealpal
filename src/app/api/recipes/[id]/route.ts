import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getRecipe } from "@/lib/recipes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const recipe = getRecipe(db, session.user.householdId, Number(id));
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}
