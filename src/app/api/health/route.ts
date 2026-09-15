import { NextResponse } from "next/server";
import { db } from "@/db";

// Unauthenticated on purpose: used by the docker-compose healthcheck, which
// has no session to send. Do not add an auth() check here.
export async function GET() {
  try {
    // Plain "SELECT 1" never touches the db file (sqlite evaluates it as a
    // constant), so it can't detect a broken/corrupt/inaccessible file.
    // Reading from sqlite_master forces a real page read while staying cheap
    // and leaking no app schema or row counts.
    db.$client.prepare("SELECT 1 FROM sqlite_master LIMIT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
