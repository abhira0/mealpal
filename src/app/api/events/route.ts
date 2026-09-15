import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { schema } from "@/db";
import { addEvents, listEvents, type EventInput, EventItemError } from "@/lib/plan";
import { listVariants } from "@/lib/variants";
import { topUpRules } from "@/lib/rules";
import { todayISO } from "@/lib/dates";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "0000-01-01";
  const to = sp.get("to") ?? "9999-12-31";
  topUpRules(db, session.user.householdId, todayISO());
  return NextResponse.json(listEvents(db, session.user.householdId, from, to));
}

// Validate one event item and resolve it to an EventInput ready for addEvent.
// Shared by the single-object and array request bodies so both go through the
// same checks; throws with a message describing the problem.
function resolveEventInput(hid: number, b: unknown): { input: EventInput } | { error: string; status: number } {
  const body = b as Record<string, unknown> | null;
  if (!body?.date || !body?.slotId)
    return { error: "date and slotId required", status: 400 };

  // Exactly one kind: recipe meal, direct ingredient, or direct product.
  const set = (v: unknown) => v != null && v !== "";
  if ([body?.recipeId, body?.ingredientId, body?.productId].filter(set).length !== 1)
    return { error: "provide exactly one of recipeId, ingredientId, productId", status: 400 };

  const slotId = Number(body.slotId);
  const [slot] = db.select({ id: schema.mealSlots.id }).from(schema.mealSlots)
    .where(and(eq(schema.mealSlots.id, slotId), eq(schema.mealSlots.householdId, hid))).all();
  if (!slot) return { error: "slot not found", status: 404 };

  const base = { date: String(body.date), slotId, servings: Number(body.servings) || 1 };

  if (set(body.recipeId)) {
    const recipeId = Number(body.recipeId);
    const [recipe] = db.select({ id: schema.recipes.id }).from(schema.recipes)
      .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, hid))).all();
    if (!recipe) return { error: "recipe not found", status: 404 };
    return { input: { ...base, recipeId } };
  }

  if (set(body.ingredientId)) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return { error: "amount must be a positive number", status: 400 };
    return { input: { ...base, ingredientId: Number(body.ingredientId), amount } };
  }

  // product item — variant is optional; if omitted for an assorted product, the
  // cook picker asks which variant was used at cook time.
  const productId = Number(body.productId);
  const [product] = db.select().from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.householdId, hid))).all();
  if (!product) return { error: "product not found", status: 404 };
  const variants = listVariants(db, hid, productId);
  let variantId: number | null = null;
  if (set(body.variantId)) {
    variantId = Number(body.variantId);
    if (!variants.some((v) => v.id === variantId))
      return { error: "variant not found for this product", status: 400 };
  }
  // optional: log a direct canonical-unit amount (e.g. grams) instead of servings
  let amount: number | undefined;
  if (set(body.amount)) {
    amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return { error: "amount must be a positive number", status: 400 };
  }
  return { input: { ...base, productId, variantId, amount } };
}

// A meal is a collection of items (a recipe plus its sides); the add-meal
// sheet posts either a single item (back-compat) or the whole array in one
// request so the batch is all-or-nothing — see addEvents in @/lib/plan.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hid = session.user.householdId;
  const raw = await req.json().catch(() => null);
  if (raw == null) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const isArray = Array.isArray(raw);
  const items = isArray ? raw : [raw];
  if (items.length === 0) return NextResponse.json({ error: "no items" }, { status: 400 });

  const inputs: EventInput[] = [];
  for (let i = 0; i < items.length; i++) {
    const resolved = resolveEventInput(hid, items[i]);
    if ("error" in resolved) {
      return NextResponse.json(
        isArray ? { error: resolved.error, index: i } : { error: resolved.error },
        { status: isArray ? 400 : resolved.status },
      );
    }
    inputs.push(resolved.input);
  }

  try {
    const rows = addEvents(db, hid, inputs);
    return NextResponse.json(isArray ? rows : rows[0], { status: 201 });
  } catch (e) {
    if (e instanceof EventItemError)
      return NextResponse.json({ error: e.message, index: e.index }, { status: 400 });
    throw e;
  }
}
