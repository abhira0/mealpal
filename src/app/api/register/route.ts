import { NextResponse } from "next/server";
import { db } from "@/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  const name = body?.name?.trim() || null;
  const householdName = body?.householdName?.trim() || "My Household";

  if (!email || !password || String(password).length < 6) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 },
    );
  }

  if (await findUserByEmail(db, email)) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  await registerHousehold(db, { email, password, name, householdName });
  return NextResponse.json({ ok: true }, { status: 201 });
}
