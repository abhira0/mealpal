import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/auth";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rate-limit";

export const { GET } = handlers;

export async function POST(req: NextRequest) {
  // Only the credentials sign-in callback needs rate limiting here; other
  // POSTs under /api/auth/* (csrf, signout, etc.) aren't login attempts.
  if (new URL(req.url).pathname.endsWith("/callback/credentials")) {
    const ip = getClientIp(req);
    const key = `login:${ip}`;
    if (isRateLimited(key)) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 },
      );
    }
    recordAttempt(key);
  }
  return handlers.POST(req);
}
