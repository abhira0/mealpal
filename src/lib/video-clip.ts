import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Cached clips are served statically from here; the full downloaded source
// (not meant to be public) lives outside public/.
const CLIP_DIR = path.join(process.cwd(), "public", "clips");
const SOURCE_DIR = path.join(process.cwd(), ".cache", "yt-source");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureSource(videoId: string): Promise<string> {
  const src = path.join(SOURCE_DIR, `${videoId}.mp4`);
  if (await exists(src)) return src;
  await mkdir(SOURCE_DIR, { recursive: true });
  await run("yt-dlp", [
    "-f", "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "--merge-output-format", "mp4",
    "-o", src,
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  return src;
}

/**
 * Downloads (once per video) and trims a clip for [start,end) of a YouTube
 * video, caching the result under public/clips/. Returns the public URL
 * path, or null on failure (bad id, yt-dlp/ffmpeg missing, network, etc).
 * ponytail: no locking — a duplicate concurrent request just redoes the work.
 */
export async function cacheClip(videoId: string, start: number, end: number): Promise<string | null> {
  const rel = `/clips/${videoId}/${start}-${end}.mp4`;
  const out = path.join(CLIP_DIR, videoId, `${start}-${end}.mp4`);
  if (await exists(out)) return rel;
  try {
    const src = await ensureSource(videoId);
    await mkdir(path.dirname(out), { recursive: true });
    await run("ffmpeg", [
      "-y",
      "-ss", String(start),
      "-i", src,
      "-t", String(end - start),
      "-vf", "scale=-2:480",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "28",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ]);
    return rel;
  } catch {
    return null;
  }
}
