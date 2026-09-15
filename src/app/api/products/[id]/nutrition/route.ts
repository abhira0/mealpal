import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { updateProduct } from "@/lib/products";

// Label photos live in public/nutrition/ (served statically by Next), not the
// DB — so they're readable straight off disk when filling in the numbers.
const DIR = path.join(process.cwd(), "public", "nutrition");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB — a nutrition label photo, not a movie

// Sniff the first bytes so a text file renamed ".jpg" doesn't pass just because
// the client set a matching Content-Type on the form part.
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "image/heic": (b) => b.subarray(4, 8).toString("ascii") === "ftyp",
};

// Remove any existing public/nutrition/<id>.* so a replaced photo can't orphan.
async function removeExisting(id: number) {
  const files = await readdir(DIR).catch(() => [] as string[]);
  await Promise.all(
    files.filter((f) => f.startsWith(`${id}.`)).map((f) => unlink(path.join(DIR, f)).catch(() => {})),
  );
}

// Upload/replace the nutrition-facts photo (multipart form field "photo").
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);

  // Confirm this product is ours BEFORE touching the filesystem — otherwise a
  // PUT to someone else's product id would delete/overwrite their nutrition
  // photo file even though the DB write below is correctly household-scoped.
  const [owned] = db.select({ id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.id, id), eq(schema.products.householdId, session.user.householdId))).all();
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reject oversized uploads off the Content-Length header, before touching
  // the body at all — no point parsing multipart just to throw it away.
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo too large." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo uploaded." }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Photo too large." }, { status: 413 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (!MAGIC[file.type](buf)) {
    return NextResponse.json({ error: "File contents don't match a supported image type." }, { status: 400 });
  }

  await mkdir(DIR, { recursive: true });
  await removeExisting(id);
  await writeFile(path.join(DIR, `${id}.${ext}`), buf);

  const photo = `/nutrition/${id}.${ext}`;
  const row = updateProduct(db, session.user.householdId, id, { nutritionPhoto: photo });
  if (!row) {
    await removeExisting(id); // not our product — don't leave the file behind
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ nutritionPhoto: photo });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const row = updateProduct(db, session.user.householdId, id, { nutritionPhoto: null });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await removeExisting(id);
  return NextResponse.json({ ok: true });
}
