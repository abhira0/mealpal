import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { expiryByIngredient, stockByIngredient } from "@/lib/stock";
import { plannedConsumption, runOutDates } from "@/lib/plan";
import { buyRecommendation, learnedShelfLife, listExtras, urgency } from "@/lib/shopping";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const sp = new URL(req.url).searchParams;
  const horizon = Math.min(90, Math.max(1, Number(sp.get("horizon")) || 14));
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10);
  const stock = stockByIngredient(db, hid);
  const target = plannedConsumption(db, hid, from, to, learnedShelfLife(db, hid));
  // Stock past its expiry date is spoiled: only what the plan consumes before
  // expiry counts, so replacements show up as soon as expiry (not depletion) demands.
  // Past dates are dropped — expiryByIngredient mins over ALL purchases ever, and a
  // long-consumed pack's old date must not zero out the fresh stock on hand.
  const expiry = new Map([...expiryByIngredient(db, hid)].filter(([, d]) => d >= from));
  const expiryDays = new Map([...expiry].map(([id, d]) =>
    [id, Math.round((Date.parse(d) - Date.parse(from)) / 86_400_000)] as const));
  const useBeforeExpiry = plannedConsumption(db, hid, from, to, expiryDays);
  const usable = new Map(stock);
  for (const [id] of expiryDays)
    usable.set(id, Math.min(stock.get(id) ?? 0, useBeforeExpiry.get(id) ?? 0));
  const grouped = buyRecommendation(db, hid, usable, target);
  const runOut = runOutDates(db, hid, from, to, stock, expiry);
  for (const lines of grouped.values())
    for (const line of lines) (line as typeof line & { urgency?: unknown }).urgency = urgency(runOut.get(line.ingredientId), expiry.get(line.ingredientId), from);

  // Fold in manually-added lines. extraId marks them so the UI deletes (not "buys") them.
  for (const e of listExtras(db, hid)) {
    const shopKey = e.shopName ?? "Unassigned";
    if (!grouped.has(shopKey)) grouped.set(shopKey, []);
    grouped.get(shopKey)!.push({
      ingredientId: 0,
      ingredientName: e.title ?? e.productName ?? "Item",
      needed: e.quantity,
      product: e.productId ? { id: e.productId, name: e.productName ?? "" } : null,
      extraId: e.id,
      urgency: null,
    } as never);
  }

  return NextResponse.json(Object.fromEntries(grouped));
}
