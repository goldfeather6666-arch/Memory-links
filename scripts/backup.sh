#!/usr/bin/env bash
# MNEMOSYNE — PostgreSQL backup script.
#
# Uses pg_dump (custom format, compressed) writing a timestamped dump to
# $BACKUP_DIR (default: <repo>/backups). Retains the newest $BACKUP_RETENTION
# dumps. Respects DATABASE_URL or standard PG* environment variables.
#
# Deploy/DR note: Vercel's runtime is stateless — run this on a host with
# Postgres client tools (e.g. the database host, a cron runner, or CI).
set -euo pipefail

: "${BACKUP_DIR:=./backups}"
: "${BACKUP_RETENTION:=14}"

if [ -z "${DATABASE_URL:-}" ] && { [ -z "${PGHOST:-}" ] || [ -z "${PGDATABASE:-}" ]; }; then
  echo "error: set DATABASE_URL (or PGHOST/PGDATABASE/PGUSER/PGPASSWORD)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$BACKUP_DIR/mnemosyne-$stamp.dump.gz"

start_ns=$(date +%s%N | cut -b1-13)

echo "Starting backup -> $out_file"

# Custom format (-Fc) is compressed and restore-friendly. Pipe to gzip for
# an extra layer of compression with a stable .dump.gz artifact.
pg_dump -Fc "$DATABASE_URL" | gzip > "$out_file"

end_ns=$(date +%s%N | cut -b1-13)
elapsed_ms=$((end_ns - start_ns))
bytes=$(stat -c%s "$out_file" || stat -f%z "$out_file")

echo "Backup finished: $out_file ($bytes bytes, ${elapsed_ms}ms)"

echo "Retaining newest $BACKUP_RETENTION backups in $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mnemosyne-*.dump.gz' | sort -r |
  tail -n +$((BACKUP_RETENTION + 1)) | while read -r old; do
    echo "Removing old backup: $old"
    rm -f "$old"
done

echo "Done."
