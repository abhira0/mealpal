#!/usr/bin/env bash
# Deploy platr to the home server and run it in Docker.
# Assumes passwordless ssh to $REMOTE is already set up.
set -euo pipefail

REMOTE=arao@192.168.0.17
DIR=/home/arao/git_repos/platr

# Fold the WAL back into the main db file so the copy is complete.
sqlite3 platr.db 'PRAGMA wal_checkpoint(TRUNCATE);' || true

# Ship the project (platr.db included for build-time; node_modules/.next rebuilt on the server).
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude data --exclude '*.db-wal' --exclude '*.db-shm' \
  ./ "$REMOTE:$DIR/"

# Back up the remote db (if it exists) before anything touches it, so a bad
# migration or a bad deploy is always one file-copy from being undone.
# Aborts the deploy (set -e, remote exit code propagates through ssh) if the backup fails.
ssh "$REMOTE" "if [ -f $DIR/data/platr.db ]; then DATABASE_URL=$DIR/data/platr.db BACKUP_DIR=$DIR/backups bash $DIR/scripts/backup.sh; else echo 'no remote db yet, nothing to back up'; fi"

# One-time db migration: seed ./data from the shipped db, never clobber an existing one.
ssh "$REMOTE" "mkdir -p $DIR/data && { [ -f $DIR/data/platr.db ] && echo 'remote db exists, kept it'; } || cp $DIR/platr.db $DIR/data/platr.db"

# compose auto-loads .env for ${AUTH_SECRET} substitution (DATABASE_URL in it is unused).
scp .env.local "$REMOTE:$DIR/.env"

ssh "$REMOTE" "cd $DIR && docker compose up -d --build"
echo "up -> http://192.168.0.17:29999"
