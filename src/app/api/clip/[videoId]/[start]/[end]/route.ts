import { NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { auth } from "@/auth";
import { cacheClip, parseByteRange } from "@/lib/video-clip";

const MAX_CLIP_SECONDS = 180;

// Streams the cached clip directly (with Range support) instead of
// redirecting to the static file — some browsers mishandle range/resume
// requests across a redirected <video> src, restarting playback from 0.
export async function GET(req: Request, { params }: { params: Promise<{ videoId: string; start: string; end: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, start, end } = await params;
  const s = Number(start);
  const e = Number(end);
  if (!/^[\w-]{11}$/.test(videoId) || !Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || e - s > MAX_CLIP_SECONDS) {
    return NextResponse.json({ error: "Bad clip range" }, { status: 400 });
  }

  const localPath = await cacheClip(videoId, s, e);
  if (!localPath) return NextResponse.json({ error: "Failed to prepare clip" }, { status: 502 });

  const filePath = path.join(process.cwd(), "public", localPath);
  const stat = statSync(filePath);
  const baseHeaders = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // Clamped against the actual file size — an out-of-bounds Range (past EOF,
  // or a suffix range we don't parse) falls back to a full 200 rather than
  // promising a Content-Length the stream can't deliver.
  const parsed = parseByteRange(req.headers.get("range"), stat.size);
  if (!parsed) {
    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: { ...baseHeaders, "Content-Length": String(stat.size) },
    });
  }

  const { start: rangeStart, end: rangeEnd } = parsed;
  return new NextResponse(Readable.toWeb(createReadStream(filePath, { start: rangeStart, end: rangeEnd })) as ReadableStream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${stat.size}`,
      "Content-Length": String(rangeEnd - rangeStart + 1),
    },
  });
}
