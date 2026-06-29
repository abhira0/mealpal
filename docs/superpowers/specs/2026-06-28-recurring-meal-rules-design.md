# Recurring Meal Rules — Design

Date: 2026-06-28
Status: Approved (pending spec review)

## Problem

Adding a meal is one-at-a-time today: `PlanEditor.tsx` → `POST /api/events` →
`addEvent()` inserts a single `mealEvents` row. There is no way to say
"Morning Smoothie every breakfast." Users want a recurring rule that both
backfills a date range now and keeps future days filled automatically.

## Goal

A recurrence rule (recipe + slot, interval, days-of-week, optional until date)
that materializes real `mealEvents` rows for matching days — past (backfill)
and future (rolling horizon) — while manual edits to individual days win
permanently.

## Approach: Materialize rows (chosen)

Rules are stored in a new `mealRules` table. Saving a rule inserts real
`mealEvents` rows for every matching day from `startDate` through a rolling
horizon. Because the rows are real, **every existing reader is untouched**:
shopping list (`plannedConsumption`), cooking (`cookEvent`), and the plan view
(`listEvents`) keep working as-is.

Rejected alternative — resolve-at-read (virtual events): no horizon and free
backfill, but forces every `mealEvents` consumer through a projection layer.
Too invasive and fragile for the benefit.

### Rolling horizon

- Constant `RULE_HORIZON_DAYS = 56` (8 weeks).
- On rule save: materialize from `startDate` (or backfill start) up to
  `today + RULE_HORIZON_DAYS`, capped at `untilDate` if set.
- Top-up: a `topUpRules(db, householdId)` call runs when the plan page loads.
  It materializes any not-yet-generated matching days from the last generated
  date up to the current horizon. This is the "evergreen" mechanism — as days
  pass, future rows get filled. Idempotent (see generation rule below).

## Override model: manual edits win permanently

- Generated rows carry `ruleId`. Untouched generated rows may be regenerated.
- Editing a generated meal (swap recipe / change servings) clears its `ruleId`
  → it becomes a manual row the rule never touches again.
- Deleting a generated meal for one day writes a tombstone row in
  `mealRuleSkips (ruleId, date, slotId)`. Top-up/regen skip tombstoned days.
- Generation rule (idempotent): for a given (rule, date, slot), materialize a
  row ONLY IF there is no existing `mealEvents` row for that
  (householdId, date, slotId) AND no matching tombstone. This means a manual
  meal already on that slot/day also blocks the rule — manual always wins.

## Schema additions

```ts
export const mealRules = sqliteTable("meal_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  servings: integer("servings").notNull().default(1),
  // recurrence: every `intervalN` `unit`s
  intervalN: integer("interval_n").notNull().default(1),
  unit: text("unit").notNull().default("week"),        // 'day' | 'week'
  // days of week as 7-char mask, index 0=Sun..6=Sat, e.g. "1011000".
  // For unit='day' this is ignored (every interval-th day from startDate).
  daysOfWeek: text("days_of_week").notNull().default("1111111"),
  startDate: text("start_date").notNull(),             // YYYY-MM-DD
  untilDate: text("until_date"),                       // YYYY-MM-DD | null
  // furthest date generated so far; drives top-up. null = nothing generated yet
  generatedThrough: text("generated_through"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const mealRuleSkips = sqliteTable("meal_rule_skips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull().references(() => mealRules.id),
  date: text("date").notNull(),                        // YYYY-MM-DD
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
});
```

`mealEvents` gains a nullable `ruleId integer references meal_rules.id`.

Migration: generate with drizzle, then run `db:migrate` (per project rule —
always run migrations after generating).

## Recurrence expansion

Pure function, easy to unit-test:

```ts
// returns YYYY-MM-DD strings in [from, to] that match the rule
function matchingDates(rule, from, to): string[]
```

- `unit='week'`: a date matches if its weekday bit is set in `daysOfWeek` AND
  the week index from `startDate` is divisible by `intervalN`.
- `unit='day'`: a date matches if `(date - startDate) % intervalN === 0`.
- Clamp to `[startDate, untilDate ?? +inf]`.

## lib/rules.ts (new)

- `createRule(db, householdId, input)` — insert rule, then `materialize` from
  `input.backfillFrom ?? startDate` to horizon.
- `materialize(db, rule, from, to)` — for each `matchingDates` not blocked by
  an existing event or tombstone, insert a `mealEvents` row with `ruleId`;
  update `generatedThrough`.
- `topUpRules(db, householdId)` — for each rule, `materialize` from
  `generatedThrough+1` to current horizon.
- `deleteRule(db, householdId, ruleId, { keepGenerated })` — delete rule;
  if `!keepGenerated`, delete its still-tagged (ruleId-bearing) future events.
- `skipDay(db, ruleId, date, slotId)` — write tombstone + delete that day's
  generated event (used when a generated meal is deleted).

## API

- `POST /api/rules` — create rule `{ slotId, recipeId, servings, intervalN,
  unit, daysOfWeek, startDate, untilDate?, backfillFrom? }`.
- `DELETE /api/rules/:id?keepGenerated=true|false`.
- Existing `DELETE` of a meal event: if the event has a `ruleId`, route through
  `skipDay` so it doesn't regenerate; otherwise plain delete.
- Existing edit of a meal event: clear `ruleId` on update so it detaches.

## UI (PlanEditor.tsx)

In the add-meal sheet, add a "Repeat" section mirroring the user's reference:
- toggle off = single event (current behavior, unchanged)
- toggle on = day-of-week chips (S M T W T F S), `Every [N] [day|week]`,
  optional "Until" date. Submitting hits `POST /api/rules` instead of
  `/api/events`.
- Backfill: default `backfillFrom = startDate` = the date the sheet was opened
  on; the rule fills from that day forward (covers "this week onward"). No
  separate backfill UI in v1 — startDate is the backfill anchor.

Plan page load calls `topUpRules` before `listEvents`.

## Testing

- `matchingDates`: unit tests for weekly-with-days, every-2-weeks,
  daily-every-3, until clamping, startDate clamping.
- `materialize` idempotency: running twice produces no duplicates; respects
  existing manual events and tombstones.
- `skipDay`: tombstoned day is not regenerated on top-up.

## Out of scope (v1)

- Monthly / "every Nth weekday of month" recurrence.
- Editing a rule's recurrence in place (delete + recreate covers it).
- End-by-count ("for 10 occurrences"); only end-by-date.
