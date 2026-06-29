#!/usr/bin/env bash
# Regenerate drizzle/demo_seed.sql from the current DB, scoped to the
# demo@demo.com household (id 8). Idempotent inserts (INSERT OR IGNORE).
#
# This is a DATA seed applied AFTER migrations (npm run db:seed) so it always
# matches the final schema -- it is intentionally not a drizzle migration.
#
# Tables and their household filters are auto-discovered, so new tables are
# picked up automatically:
#   - households            -> id = HH
#   - has a household_id col -> household_id = HH
#   - otherwise (child table) -> filter via its FK to a household-scoped parent
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-./mealpal.db}"
OUT="drizzle/demo_seed.sql"
HH=8  # demo@demo.com household id

q() { sqlite3 "$DB" "$1"; }
has_col()  { [ -n "$(q "SELECT 1 FROM pragma_table_info('$1') WHERE name='$2' LIMIT 1;")" ]; }

# Print the WHERE clause that scopes table $1 to household HH, or nothing if it
# can't be scoped (skip those).
where_for() {
  local t="$1"
  if [ "$t" = households ]; then echo "id=$HH"; return; fi
  if has_col "$t" household_id; then echo "household_id=$HH"; return; fi
  # child table: find first FK whose parent is household-scoped
  local row from ptable
  while IFS='|' read -r from ptable; do
    [ -z "$ptable" ] && continue
    if [ "$ptable" = households ]; then echo "$from IN (SELECT id FROM households WHERE id=$HH)"; return; fi
    if has_col "$ptable" household_id; then echo "$from IN (SELECT id FROM $ptable WHERE household_id=$HH)"; return; fi
  done < <(q "SELECT \"from\"||'|'||\"table\" FROM pragma_foreign_key_list('$t');")
}

# households first, then household-scoped tables, then child tables (tidy; FK
# enforcement is off during sqlite3 apply so order is not load-bearing).
tables=$(q "SELECT name FROM sqlite_master WHERE type='table'
            AND name NOT IN ('__drizzle_migrations','sqlite_sequence')
            ORDER BY (name='households') DESC, name;")

{
  echo "-- Demo seed: snapshot of demo@demo.com's household (id $HH). Idempotent via INSERT OR IGNORE."
  echo "-- Regenerate: npm run db:reseed   |   Apply: npm run db:seed"
  for t in $tables; do
    w=$(where_for "$t")
    [ -z "$w" ] && { echo "-- skipped $t (no household scope)"; continue; }
    sqlite3 "$DB" ".mode insert $t" "SELECT * FROM $t WHERE $w;"
  done
} | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > "$OUT"

echo "wrote $OUT"
grep -oE 'INSERT OR IGNORE INTO [a-z_]+' "$OUT" | sort | uniq -c
grep '^-- skipped' "$OUT" || true
