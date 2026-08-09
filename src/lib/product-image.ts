import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Scraped product images live in public/products/ (served statically), not
// re-fetched from the vendor's CDN on every load — those URLs rot.
const DIR = path.join(process.cwd(), "public", "products");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

async function removeExisting(id: number) {
  const files = await readdir(DIR).catch(() => [] as string[]);
  await Promise.all(
    files.filter((f) => f.startsWith(`${id}.`)).map((f) => unlink(path.join(DIR, f)).catch(() => {})),
  );
}

/**
 * Downloads an external image URL to public/products/<id>.<ext> and returns
 * the local path. Already-local paths (starting with "/") pass through
 * unchanged. Returns null (and leaves nothing behind) on fetch failure.
 */
export async function cacheProductImage(id: number, imageUrl: string | null): Promise<string | null> {
  if (!imageUrl || imageUrl.startsWith("/")) return imageUrl;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const ext = EXT[res.headers.get("content-type")?.split(";")[0] ?? ""] ?? "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(DIR, { recursive: true });
    await removeExisting(id);
    await writeFile(path.join(DIR, `${id}.${ext}`), buf);
    return `/products/${id}.${ext}`;
  } catch {
    return null;
  }
}
