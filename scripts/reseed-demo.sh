#!/usr/bin/env bash
# Regenerate drizzle/demo_seed.sql from the current DB, scoped to the
# demo@demo.com household (id 8). Idempotent inserts (INSERT OR IGNORE).
# This is a DATA seed, applied AFTER migrations (npm run db:seed) so it always
# matches the final schema -- it is intentionally not a drizzle migration.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-./mealpal.db}"
OUT="drizzle/demo_seed.sql"
HH=8  # demo@demo.com household id

gen() { sqlite3 "$DB" ".mode insert $1" "SELECT * FROM $1 WHERE $2;"; }
{
  echo "-- Demo seed: snapshot of demo@demo.com's household (id $HH). Idempotent via INSERT OR IGNORE."
  echo "-- Regenerate with: npm run db:reseed   |   Apply with: npm run db:seed"
  gen households        "id=$HH"
  gen users             "household_id=$HH"
  gen ingredients       "household_id=$HH"
  gen shops             "household_id=$HH"
  gen products          "household_id=$HH"
  gen prices            "product_id IN (SELECT id FROM products WHERE household_id=$HH)"
  gen recipes           "household_id=$HH"
  gen recipe_ingredients "recipe_id IN (SELECT id FROM recipes WHERE household_id=$HH)"
  gen recipe_steps      "recipe_id IN (SELECT id FROM recipes WHERE household_id=$HH)"
  gen recipe_media      "recipe_id IN (SELECT id FROM recipes WHERE household_id=$HH)"
  gen meal_slots        "household_id=$HH"
  gen meal_events       "household_id=$HH"
  gen stock_movements   "household_id=$HH"
  gen purchases         "household_id=$HH"
} | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > "$OUT"
echo "wrote $OUT"
grep -oE 'INSERT OR IGNORE INTO [a-z_]+' "$OUT" | sort | uniq -c
