import { NextResponse } from "next/server";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { db } from "@/db";
import { updateProduct } from "@/lib/products";

// Label photos live in public/nutrition/ (served statically by Next), not the
// DB — so they're readable straight off disk when filling in the numbers.
const DIR = path.join(process.cwd(), "public", "nutrition");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
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

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo uploaded." }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });

  await mkdir(DIR, { recursive: true });
  await removeExisting(id);
  const buf = Buffer.from(await file.arrayBuffer());
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
