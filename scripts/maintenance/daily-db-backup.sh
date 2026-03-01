#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required."
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-maintenance/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

PG_DUMP_BIN="${PG_DUMP_BIN:-}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-}"

if [[ -z "$PG_DUMP_BIN" ]]; then
  if [[ -x "/opt/homebrew/opt/libpq/bin/pg_dump" ]]; then
    PG_DUMP_BIN="/opt/homebrew/opt/libpq/bin/pg_dump"
  else
    PG_DUMP_BIN="pg_dump"
  fi
fi

if [[ -z "$PG_RESTORE_BIN" ]]; then
  if [[ -x "/opt/homebrew/opt/libpq/bin/pg_restore" ]]; then
    PG_RESTORE_BIN="/opt/homebrew/opt/libpq/bin/pg_restore"
  else
    PG_RESTORE_BIN="pg_restore"
  fi
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/nstc-prod-$TS.dump"
MANIFEST_FILE="$BACKUP_DIR/nstc-prod-$TS.manifest.txt"
CHECKSUM_FILE="$BACKUP_DIR/nstc-prod-$TS.sha256"

"$PG_DUMP_BIN" "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "$BACKUP_FILE"

shasum -a 256 "$BACKUP_FILE" > "$CHECKSUM_FILE"
"$PG_RESTORE_BIN" -l "$BACKUP_FILE" > "$MANIFEST_FILE"

find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "nstc-prod-*" -delete

echo "Backup created: $BACKUP_FILE"
echo "Manifest: $MANIFEST_FILE"
echo "Checksum: $CHECKSUM_FILE"
