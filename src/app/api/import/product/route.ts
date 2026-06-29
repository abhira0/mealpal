import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAndExtract } from "@/lib/scrape-products";

// Scrapes the product tab open in your debug Chrome (Instacart or Weee, picked
// by URL) and returns the fields to prefill the New Product form. Writes
// nothing — the form saves.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await connectAndExtract());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scrape failed";
    // Most common cause: Chrome not launched with --remote-debugging-port=9222.
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
