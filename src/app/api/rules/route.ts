import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createRules, listRules, type RuleInput, RuleItemError } from "@/lib/rules";
import { DATE_RE, todayISO } from "@/lib/dates";

// List every recurring rule for the household (management/debugging view —
// previously there was no way to see created rules other than via the agenda).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listRules(db, session.user.householdId));
}

// Validate one rule item and resolve it to a RuleInput ready for createRule.
// Shared by the single-object and array request bodies, mirroring /api/events.
function resolveRuleInput(b: unknown): { input: RuleInput } | { error: string } {
  const body = b as Record<string, unknown> | null;
  // exactly one item kind, mirroring /api/events
  const item = [body?.recipeId, body?.productId, body?.ingredientId].filter((v) => v != null).length;
  if (!body?.slotId || !body?.startDate || item !== 1)
    return { error: "slotId, startDate, and exactly one of recipeId/productId/ingredientId required" };
  // A direct-ingredient rule needs a positive amount per occurrence — mirrors
  // /api/events, which rejects the same case. Without this, createRule silently
  // stores amount 0 and every materialized occurrence logs zero consumption.
  if (body.ingredientId != null && (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0))
    return { error: "amount must be a positive number" };
  // startDate/untilDate must be well-formed dates, or matchingDates() silently
  // compares NaN timestamps and the rule never materializes anything.
  if (typeof body.startDate !== "string" || !DATE_RE.test(body.startDate))
    return { error: "startDate must be a valid YYYY-MM-DD date" };
  if (body.untilDate != null) {
    if (typeof body.untilDate !== "string" || !DATE_RE.test(body.untilDate))
      return { error: "untilDate must be a valid YYYY-MM-DD date" };
    if (body.untilDate < body.startDate)
      return { error: "untilDate must not be before startDate" };
  }
  const unit = body.unit === "day" ? "day" : "week";
  const daysOfWeek = typeof body.daysOfWeek === "string" && /^[01]{7}$/.test(body.daysOfWeek)
    ? body.daysOfWeek : "1111111";
  // mirror PATCH /api/rules/[id]: a weekly rule with no day selected never fires.
  if (unit === "week" && !daysOfWeek.includes("1"))
    return { error: "pick at least one day of the week" };
  return {
    input: {
      slotId: Number(body.slotId),
      recipeId: body.recipeId != null ? Number(body.recipeId) : null,
      productId: body.productId != null ? Number(body.productId) : null,
      variantId: body.variantId != null ? Number(body.variantId) : null,
      ingredientId: body.ingredientId != null ? Number(body.ingredientId) : null,
      amount: body.amount != null ? Number(body.amount) : null,
      servings: Number(body.servings) || 1,
      intervalN: Math.max(1, Number(body.intervalN) || 1),
      unit,
      daysOfWeek,
      startDate: String(body.startDate),
      untilDate: body.untilDate ? String(body.untilDate) : null,
    },
  };
}

// A repeating meal is a collection of per-item rules; the add-meal sheet posts
// either a single item (back-compat) or the whole array in one request so the
// batch is all-or-nothing — see createRules in @/lib/rules.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => null);
  if (raw == null) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const isArray = Array.isArray(raw);
  const items = isArray ? raw : [raw];
  if (items.length === 0) return NextResponse.json({ error: "no items" }, { status: 400 });

  const inputs: RuleInput[] = [];
  for (let i = 0; i < items.length; i++) {
    const resolved = resolveRuleInput(items[i]);
    if ("error" in resolved) {
      return NextResponse.json(
        isArray ? { error: resolved.error, index: i } : { error: resolved.error },
        { status: 400 },
      );
    }
    inputs.push(resolved.input);
  }

  try {
    const rows = createRules(db, session.user.householdId, todayISO(), inputs);
    return NextResponse.json(isArray ? rows : rows[0], { status: 201 });
  } catch (e) {
    if (e instanceof RuleItemError)
      return NextResponse.json({ error: e.message, index: e.index }, { status: 400 });
    throw e;
  }
}
