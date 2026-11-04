#!/usr/bin/env bash
#
# MNEMOSYNE — scripts/restore.sh
#
# Restore a backup produced by scripts/backup.sh into the target database
# ($DATABASE_URL or standard PG* env vars), or validate it with --dry-run
# without connecting to or modifying any database.
#
# Supported formats (both gzip-compressed):
#   * custom-format pg_dump archive (PGDMP) — restored via pg_restore.
#   * plain-text SQL dump — restored via psql.
#
# Usage:
#   DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME \
#     ./scripts/restore.sh path/to/mnemosyne-<ts>.dump.gz
#   ./scripts/restore.sh --dry-run path/to/mnemosyne-<ts>.dump.gz
#
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/restore.sh [--dry-run] <backup-file>

  <backup-file>   gzip-compressed pg_dump archive (custom format) produced by
                  scripts/backup.sh, or a plain-text SQL dump (gzipped).
  --dry-run       Validate the archive (pg_restore --list / gzip integrity)
                  and exit WITHOUT connecting to or modifying the database.

The target database comes from $DATABASE_URL or PG* environment variables.
EOF
}

DRY_RUN=0
DUMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "restore: error: unknown option: $1" >&2; usage; exit 2 ;;
    *) DUMP="$1"; shift ;;
  esac
done

if [[ -z "$DUMP" ]]; then
  echo "restore: error: missing backup file argument." >&2
  usage
  exit 2
fi
if [[ ! -f "$DUMP" ]]; then
  echo "restore: error: backup file not found: $DUMP" >&2
  exit 1
fi

for tool in pg_restore psql gzip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "restore: error: required tool '$tool' not found on PATH." >&2
    exit 2
  fi
done

CONN=( )
if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN+=( "$DATABASE_URL" )
elif [[ -z "${PGDATABASE:-}" ]]; then
  echo "restore: error: set DATABASE_URL (or PGDATABASE with PG* env) to restore." >&2
  exit 2
fi

# Sniff the uncompressed header to pick the right restore path.
MAGIC="$(gzip -dc "$DUMP" 2>/dev/null | head -c 6 || true)"

if [[ "$MAGIC" == "PGDMP" ]]; then
  FORMAT=custom
elif [[ "$MAGIC" == "--"* ]]; then
  FORMAT=plain
else
  echo "restore: error: unrecognized dump format (not a pg_dump custom/plain archive)." >&2
  exit 2
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "restore: dry-run: validating archive $DUMP (format=$FORMAT) — database will not be touched."
  if [[ "$FORMAT" == "custom" ]]; then
    pg_restore --list "$DUMP" >/dev/null
  else
    gzip -t "$DUMP"
  fi
  echo "restore: dry-run: OK — archive is valid."
  exit 0
fi

if [[ "$FORMAT" == "custom" ]]; then
  echo "restore: restoring custom-format archive $DUMP via pg_restore..."
  pg_restore "${CONN[@]}" --no-owner --no-privileges --clean --if-exists "$DUMP"
else
  echo "restore: restoring plain SQL archive $DUMP via psql..."
  gzip -dc "$DUMP" | psql "${CONN[@]}"
fi
echo "restore: complete."
