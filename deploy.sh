#!/usr/bin/env bash
# Deploy mealpal to the home server and run it in Docker.
# Assumes passwordless ssh to $REMOTE is already set up.
set -euo pipefail

REMOTE=arao@192.168.0.17
DIR=/home/arao/git_repos/mealpal

# Fold the WAL back into the main db file so the copy is complete.
sqlite3 mealpal.db 'PRAGMA wal_checkpoint(TRUNCATE);' || true

# Ship the project (mealpal.db included for build-time; node_modules/.next rebuilt on the server).
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude data --exclude '*.db-wal' --exclude '*.db-shm' \
  ./ "$REMOTE:$DIR/"

# One-time db migration: seed ./data from the shipped db, never clobber an existing one.
ssh "$REMOTE" "mkdir -p $DIR/data && { [ -f $DIR/data/mealpal.db ] && echo 'remote db exists, kept it'; } || cp $DIR/mealpal.db $DIR/data/mealpal.db"

# compose auto-loads .env for ${AUTH_SECRET} substitution (DATABASE_URL in it is unused).
scp .env.local "$REMOTE:$DIR/.env"

ssh "$REMOTE" "cd $DIR && docker compose up -d --build"
echo "up -> http://192.168.0.17:3000"
