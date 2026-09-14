#!/usr/bin/env bash
# Back up the production SQLite database using SQLite's own online backup
# API (safe against a live writer, unlike `cp`), then prune old backups.
#
# Backups live outside ./data (the bind mount docker-compose.yml wipes if
# the data volume is ever deleted) — default /backups, which docker-compose.yml
# mounts as ./backups:/backups.
#
# Retention: keep the 7 most recent daily backups, plus the 4 most recent
# Sunday ("weekly") backups. Everything else gets deleted.
set -euo pipefail

DB="${DATABASE_URL:-/data/platr.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TODAY="$(date +%F)"
DEST="$BACKUP_DIR/platr-$TODAY.db"

mkdir -p "$BACKUP_DIR"

sqlite3 "$DB" ".backup '$DEST'"
echo "backup.sh: backed up $DB -> $DEST"

# --- prune: keep 7 dailies + 4 weeklies (Sunday), delete the rest ---

# Portable "YYYY-MM-DD -> epoch seconds" for both GNU date (Linux, asus-server)
# and BSD date (macOS, local dev).
date_to_epoch() {
  date -d "$1" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$1" +%s
}
# Portable "YYYY-MM-DD -> ISO day-of-week (1=Mon .. 7=Sun)"
day_of_week() {
  date -d "$1" +%u 2>/dev/null || date -j -f "%Y-%m-%d" "$1" +%u
}

now_epoch="$(date +%s)"
sundays_kept=0

# Newest-first so the "keep up to 4 Sundays" rule keeps the most recent ones.
for f in $(ls -1 "$BACKUP_DIR"/platr-*.db 2>/dev/null | sort -r); do
  fname="$(basename "$f")"
  fdate="${fname#platr-}"
  fdate="${fdate%.db}"

  file_epoch="$(date_to_epoch "$fdate")" || continue
  age_days=$(( (now_epoch - file_epoch) / 86400 ))

  if [ "$age_days" -le 7 ]; then
    continue  # within the last week: always keep (daily retention)
  fi

  dow="$(day_of_week "$fdate")" || dow=""
  if [ "$dow" = "7" ] && [ "$sundays_kept" -lt 4 ]; then
    sundays_kept=$((sundays_kept + 1))
    continue  # keep as one of the 4 most recent weeklies
  fi

  echo "backup.sh: pruning $f"
  rm -f "$f"
done
