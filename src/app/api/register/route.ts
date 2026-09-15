import { NextResponse } from "next/server";
import { db } from "@/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rate-limit";

export async function POST(req: Request) {
  // PRODUCT.md: this should be a single known household, not open signup.
  // Off by default; set ALLOW_REGISTRATION=true to enable self-serve registration.
  if (process.env.ALLOW_REGISTRATION !== "true") {
    return NextResponse.json({ error: "Registration is disabled." }, { status: 403 });
  }

  const ip = getClientIp(req);
  const rateLimitKey = `register:${ip}`;
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }
  recordAttempt(rateLimitKey);

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
    // ponytail: accepted, not fixed. A generic message here still means "try
    // logging in instead" is the only way to react to it, and the field is
    // sparse (self-registration is off by default, invite-only in practice),
    // so the enumeration value to an attacker is low. If that changes, return
    // the same 201-shaped response either way and email the existing user
    // instead of erroring.
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  await registerHousehold(db, { email, password, name, householdName });
  return NextResponse.json({ ok: true }, { status: 201 });
}
