import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";

type Db = BetterSQLite3Database<typeof schema>;

/** How far ahead of "today" rules are materialized. Top-up extends this as days pass. */
export const RULE_HORIZON_DAYS = 56; // 8 weeks

export interface RuleInput {
  slotId: number;
  recipeId: number;
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
    const taken = new Set(
      db.select().from(schema.mealEvents)
        .where(and(
          eq(schema.mealEvents.householdId, rule.householdId),
          eq(schema.mealEvents.slotId, rule.slotId),
        )).all()
        .map((e) => e.date),
    );
    for (const date of dates) {
      if (skips.has(date) || taken.has(date)) continue;
      db.insert(schema.mealEvents).values({
        householdId: rule.householdId, date, slotId: rule.slotId,
        recipeId: rule.recipeId, servings: rule.servings, status: "planned",
        ruleId: rule.id,
      }).run();
    }
  }
  if (!rule.generatedThrough || to > rule.generatedThrough) {
    db.update(schema.mealRules).set({ generatedThrough: to })
      .where(eq(schema.mealRules.id, rule.id)).run();
  }
}

export function createRule(db: Db, householdId: number, today: string, input: RuleInput) {
  const [rule] = db.insert(schema.mealRules).values({
    householdId,
    slotId: input.slotId,
    recipeId: input.recipeId,
    servings: input.servings,
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
