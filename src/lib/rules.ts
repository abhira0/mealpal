import { and, eq, gte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { assertOwnedRefs } from "@/lib/ownership";

type Db = BetterSQLite3Database<typeof schema>;

/** How far ahead of "today" rules are materialized. Top-up extends this as days pass. */
export const RULE_HORIZON_DAYS = 56; // 8 weeks

export interface RuleInput {
  slotId: number;
  // exactly one item kind, mirroring meal_events
  recipeId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  ingredientId?: number | null;
  amount?: number | null;
  servings: number;
  intervalN: number;
  unit: "day" | "week";
  daysOfWeek: string; // 7-char mask, 0=Sun..6=Sat
  startDate: string; // YYYY-MM-DD
  untilDate?: string | null;
}

const DAY = 86_400_000;

function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}
function weekStart(d: Date): Date {
  // Sunday-anchored week start (matches daysOfWeek index 0=Sun).
  return new Date(d.getTime() - d.getUTCDay() * DAY);
}

type RuleShape = Pick<
  typeof schema.mealRules.$inferSelect,
  "intervalN" | "unit" | "daysOfWeek" | "startDate" | "untilDate"
>;

/** YYYY-MM-DD dates in [from, to] that the rule fires on. */
export function matchingDates(rule: RuleShape, from: string, to: string): string[] {
  const start = parse(rule.startDate);
  let cur = parse(from > rule.startDate ? from : rule.startDate);
  const last = parse(rule.untilDate && rule.untilDate < to ? rule.untilDate : to);
  const out: string[] = [];
  const interval = Math.max(1, rule.intervalN);
  for (; cur.getTime() <= last.getTime(); cur = new Date(cur.getTime() + DAY)) {
    if (rule.unit === "day") {
      if (dayDiff(cur, start) % interval === 0) out.push(fmt(cur));
    } else {
      if (rule.daysOfWeek[cur.getUTCDay()] !== "1") continue;
      const weekIdx = dayDiff(weekStart(cur), weekStart(start)) / 7;
      if (weekIdx % interval === 0) out.push(fmt(cur));
    }
  }
  return out;
}

/** Default horizon end date as YYYY-MM-DD, given a "today". */
export function horizonEnd(today: string): string {
  return fmt(new Date(parse(today).getTime() + RULE_HORIZON_DAYS * DAY));
}

/**
 * Insert meal_events for every matching day in [from, to] that has no existing
 * event in that (date, slot) and no tombstone. Manual or pre-existing rows win.
 * Idempotent. Advances generatedThrough to `to`.
 */
export function materialize(db: Db, rule: typeof schema.mealRules.$inferSelect, from: string, to: string) {
  const dates = matchingDates(rule, from, to);
  if (dates.length) {
    const skips = new Set(
      db.select().from(schema.mealRuleSkips)
        .where(eq(schema.mealRuleSkips.ruleId, rule.id)).all()
        .filter((s) => s.slotId === rule.slotId)
        .map((s) => s.date),
    );
    // A day is taken only by this rule's own rows (idempotency) or a manual
    // row of the same recipe; other meals in the slot coexist. Direct-item rules
    // (no recipe) dedup on their own ruleId only.
    const taken = new Set(
      db.select().from(schema.mealEvents)
        .where(and(
          eq(schema.mealEvents.householdId, rule.householdId),
          eq(schema.mealEvents.slotId, rule.slotId),
        )).all()
        .filter((e) => e.ruleId === rule.id || (rule.recipeId != null && e.recipeId === rule.recipeId))
        .map((e) => e.date),
    );
    for (const date of dates) {
      if (skips.has(date) || taken.has(date)) continue;
      db.insert(schema.mealEvents).values({
        householdId: rule.householdId, date, slotId: rule.slotId,
        recipeId: rule.recipeId, productId: rule.productId, variantId: rule.variantId,
        ingredientId: rule.ingredientId, amount: rule.amount,
        servings: rule.servings, status: "planned", ruleId: rule.id,
      }).run();
    }
  }
  if (!rule.generatedThrough || to > rule.generatedThrough) {
    db.update(schema.mealRules).set({ generatedThrough: to })
      .where(eq(schema.mealRules.id, rule.id)).run();
  }
}

/**
 * Resolve a rule's stored canonical amount + servings, mirroring addEvent so a
 * materialized direct-item event matches a one-off one.
 * ponytail: computed once at creation; later serving-size edits won't retro-apply
 * to future generated days. Recompute in materialize if that ever matters.
 */
function resolveAmount(db: Db, householdId: number, input: RuleInput): { amount: number | null; servings: number } {
  const servings = input.servings || 1;
  if (input.productId != null) {
    const [p] = db.select({ s: schema.products.servingSize }).from(schema.products)
      .where(and(eq(schema.products.id, input.productId), eq(schema.products.householdId, householdId))).all();
    let perServing = p?.s && p.s > 0 ? p.s : 1;
    if (input.variantId != null) {
      const [v] = db.select({ s: schema.productVariants.servingSize }).from(schema.productVariants)
        .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.householdId, householdId))).all();
      if (v?.s && v.s > 0) perServing = v.s;
    }
    if (input.amount != null && input.amount > 0) return { amount: input.amount, servings: input.amount / perServing };
    return { amount: servings * perServing, servings };
  }
  if (input.ingredientId != null) return { amount: input.amount ?? 0, servings };
  return { amount: null, servings }; // recipe
}

export function createRule(db: Db, householdId: number, today: string, input: RuleInput) {
  assertOwnedRefs(db, householdId, input);
  const resolved = resolveAmount(db, householdId, input);
  const [rule] = db.insert(schema.mealRules).values({
    householdId,
    slotId: input.slotId,
    recipeId: input.recipeId ?? null,
    productId: input.productId ?? null,
    variantId: input.variantId ?? null,
    ingredientId: input.ingredientId ?? null,
    amount: resolved.amount,
    servings: resolved.servings,
    intervalN: input.intervalN,
    unit: input.unit,
    daysOfWeek: input.daysOfWeek,
    startDate: input.startDate,
    untilDate: input.untilDate ?? null,
  }).returning().all();
  // backfill from startDate through the rolling horizon
  const end = input.startDate > horizonEnd(today) ? input.startDate : horizonEnd(today);
  materialize(db, rule, input.startDate, end);
  return rule;
}

/** All recurring rules for a household — for a management/listing UI. */
export function listRules(db: Db, householdId: number) {
  return db.select().from(schema.mealRules)
    .where(eq(schema.mealRules.householdId, householdId)).all();
}

/** Extend every household rule up to the current horizon. Idempotent; cheap when nothing new. */
export function topUpRules(db: Db, householdId: number, today: string) {
  const rules = db.select().from(schema.mealRules)
    .where(eq(schema.mealRules.householdId, householdId)).all();
  const end = horizonEnd(today);
  for (const rule of rules) {
    const from = rule.generatedThrough
      ? fmt(new Date(parse(rule.generatedThrough).getTime() + DAY))
      : rule.startDate;
    if (from > end) continue;
    materialize(db, rule, from, end);
  }
}

/**
 * End a series at `fromDate`: keep past occurrences, drop this day and all future
 * generated (planned) ones, and clamp the rule so top-up won't re-add them.
 */
export function endSeriesFrom(db: Db, householdId: number, ruleId: number, fromDate: string) {
  const [rule] = db.select().from(schema.mealRules)
    .where(and(eq(schema.mealRules.id, ruleId), eq(schema.mealRules.householdId, householdId))).all();
  if (!rule) return;
  const until = fmt(new Date(parse(fromDate).getTime() - DAY));
  db.update(schema.mealRules).set({ untilDate: until })
    .where(eq(schema.mealRules.id, ruleId)).run();
  db.delete(schema.mealEvents).where(and(
    eq(schema.mealEvents.ruleId, ruleId),
    eq(schema.mealEvents.status, "planned"),
    gte(schema.mealEvents.date, fromDate),
  )).run();
}

/**
 * Rules added in one submission of the meal builder (one rule per item) share a
 * slot, a start date, and a creation instant. There is no group id, so treat
 * that triple as the group — a recurrence edit on one item should move all the
 * items of that meal.
 * ponytail: 5s window instead of a groupId column; add the column if meals ever
 * get created in bulk/imports where unrelated rules can land in the same second.
 */
function mealSiblings(db: Db, rule: typeof schema.mealRules.$inferSelect) {
  return db.select().from(schema.mealRules)
    .where(and(
      eq(schema.mealRules.householdId, rule.householdId),
      eq(schema.mealRules.slotId, rule.slotId),
      eq(schema.mealRules.startDate, rule.startDate),
    )).all()
    .filter((r) => Math.abs(r.createdAt.getTime() - rule.createdAt.getTime()) <= 5_000);
}

/**
 * Change a live rule's recurrence (interval/unit/days/until). Past and already
 * cooked/served occurrences are left alone; still-planned ones from `today`
 * forward are dropped and regenerated on the new cadence.
 */
export function updateRuleRecurrence(
  db: Db, householdId: number, ruleId: number, today: string,
  patch: Pick<RuleInput, "intervalN" | "unit" | "daysOfWeek"> & { untilDate?: string | null },
) {
  const [rule] = db.select().from(schema.mealRules)
    .where(and(eq(schema.mealRules.id, ruleId), eq(schema.mealRules.householdId, householdId))).all();
  if (!rule) return null;
  // Apply to every item of the same meal, not just the one card that was opened.
  const edited = mealSiblings(db, rule).map((r) => applyRecurrence(db, r, today, patch));
  return edited.find((r) => r.id === ruleId) ?? null;
}

function applyRecurrence(
  db: Db, rule: typeof schema.mealRules.$inferSelect, today: string,
  patch: Pick<RuleInput, "intervalN" | "unit" | "daysOfWeek"> & { untilDate?: string | null },
) {
  const ruleId = rule.id;
  db.delete(schema.mealEvents).where(and(
    eq(schema.mealEvents.ruleId, ruleId),
    eq(schema.mealEvents.status, "planned"),
    gte(schema.mealEvents.date, today),
  )).run();
  // Tombstones were "don't regenerate this day of the old cadence"; the new
  // cadence hits different days, so future skips would silently punch holes.
  db.delete(schema.mealRuleSkips).where(and(
    eq(schema.mealRuleSkips.ruleId, ruleId),
    gte(schema.mealRuleSkips.date, today),
  )).run();
  const [updated] = db.update(schema.mealRules).set({
    intervalN: Math.max(1, patch.intervalN),
    unit: patch.unit,
    daysOfWeek: patch.daysOfWeek,
    untilDate: patch.untilDate ?? null,
    generatedThrough: null,
  }).where(eq(schema.mealRules.id, ruleId)).returning().all();
  const from = today > updated.startDate ? today : updated.startDate;
  materialize(db, updated, from, horizonEnd(today));
  return updated;
}

/** Delete a generated meal: tombstone the day so it never regenerates, then remove the row. */
export function skipDay(db: Db, ruleId: number, date: string, slotId: number) {
  db.insert(schema.mealRuleSkips).values({ ruleId, date, slotId }).run();
  db.delete(schema.mealEvents)
    .where(and(eq(schema.mealEvents.ruleId, ruleId), eq(schema.mealEvents.date, date)))
    .run();
}

/** Delete a rule. By default also removes its still-generated (untouched) future events. */
export function deleteRule(db: Db, householdId: number, ruleId: number, keepGenerated = false) {
  const [rule] = db.select().from(schema.mealRules)
    .where(and(eq(schema.mealRules.id, ruleId), eq(schema.mealRules.householdId, householdId))).all();
  if (!rule) return;
  if (!keepGenerated) {
    db.delete(schema.mealEvents)
      .where(and(
        eq(schema.mealEvents.ruleId, ruleId),
        eq(schema.mealEvents.status, "planned"),
      )).run();
  } else {
    // detach: keep the rows but unlink them from the rule
    db.update(schema.mealEvents).set({ ruleId: null })
      .where(eq(schema.mealEvents.ruleId, ruleId)).run();
  }
  db.delete(schema.mealRuleSkips).where(eq(schema.mealRuleSkips.ruleId, ruleId)).run();
  db.delete(schema.mealRules).where(eq(schema.mealRules.id, ruleId)).run();
}
