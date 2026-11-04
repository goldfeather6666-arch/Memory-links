# MNEMOSYNE — Backup & Disaster Recovery

This document defines the backup and disaster-recovery capability for the real
deployment of MNEMOSYNE: a single Postgres database (reached via
`DATABASE_URL`), served by a Vercel/Next.js app. There is **no separate file
store**; the source of truth is the Postgres database alone, so the backup
strategy is a full logical dump of that database.

---

## 1. Scope and assumptions

| Item | Value |
|---|---|
| Data source of truth | Postgres database via `DATABASE_URL` |
| App runtime | Vercel / Next.js (no persistent local file system) |
| Backup format | `pg_dump` custom-format archive (`-Fc`, `PGDMP`), gzip-compressed |
| Stored on | Operator-managed host filesystem in `$BACKUP_DIR` (default `<repo>/backups`) |
| Credentials | Never embedded in scripts; read from env only (`DATABASE_URL` or `PG*`) |

Because Vercel functions are stateless, backups must be stored outside the
deployment (e.g. an operator-run VM, a scheduled GitHub Action with a Postgres
client, or your own cron). The scripts ship in the repo and are intended to run
wherever the operator schedules them.

---

## 2. Recovery objectives

| Objective | Target |
|---|---|
| **RPO** (Recovery Point Objective) | **Daily** — worst case you lose up to ~24h of changes |
| **RTO** (Recovery Time Objective) | **Within 1 hour** — restore to a healthy DB and repoint the app |
| Retention | `BACKUP_RETENTION` days (default **14**) |

These targets assume the daily schedule below is actually running and that a
scratch-database restore drill has validated the procedure (see §6).

---

## 3. Backup

### 3.1 Command

```bash
# From the repo root (or anywhere — paths are resolved relative to the repo):
DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DBNAME' ./scripts/backup.sh
```

Behavior:

- Dumps the database named by `DATABASE_URL` (or by `PG*` env when
  `DATABASE_URL` is unset) with `pg_dump --format=custom --no-owner
  --no-privileges`, piped through `gzip -9`.
- Writes `$BACKUP_DIR/mnemosyne-<UTC-timestamp>.dump.gz`
  (default `$BACKUP_DIR` = `<repo>/backups`).
- Prints start/finish timestamps and the archive size in bytes.
- Prunes archives older than `BACKUP_RETENTION` days (default 14).

Example output:

```text
backup: start 2025-08-01T01:30:00Z -> /app/backups/mnemosyne-20250801T013000Z.dump.gz
backup: finish 2025-08-01T01:30:31Z file=/app/backups/mnemosyne-20250801T013000Z.dump.gz bytes=28461638
backup: done (retention=14d)
```

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | (required unless `PG*` set) | Postgres connection string |
| `BACKUP_DIR` | `<repo>/backups` | Where archives are written |
| `BACKUP_RETENTION` | `14` | Keep archives younger than this many days |

> Note: `--no-owner --no-privileges` is intentional — it makes restores robust
> even if the dump was created by a role that does not exist on the target
> (e.g. Supabase pooler roles), at the cost of not preserving role grants.
> Application-level RLS/ownership is schema-defined and is captured by the dump.

### 3.2 Schedule

Run **daily** plus **immediately before any destructive migration** (any change
that drops/rewrites tables, e.g. re-running a migration after a failed release
rollback).

Cron example (daily 01:30 UTC):

```cron
30 1 * * * cd /app/mnemosyne && DATABASE_URL='postgresql://…' ./scripts/backup.sh >> backups/backup.log 2>&1
```

Because the dump is a consistent point-in-time snapshot taken from a single
`pg_dump` invocation, it is safe to run while the app is live (no lock is taken
for the whole run; `pg_dump` uses a consistent MVCC snapshot).

---

## 4. Restore

### 4.1 Validate first (dry-run) — no DB touched

```bash
./scripts/restore.sh --dry-run backups/mnemosyne-20250801T013000Z.dump.gz
# restore: dry-run: validating archive … (format=custom) — database will not be touched.
# restore: dry-run: OK — archive is valid.
```

`--dry-run` only runs `pg_restore --list` (or `gzip -t` for plain SQL dumps).
It requires the connection env vars to be present (so the script can fail fast),
but it never opens a connection or modifies any database.

### 4.2 Real restore

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DBNAME' \
  ./scripts/restore.sh backups/mnemosyne-20250801T013000Z.dump.gz
```

For custom-format archives this runs:

```bash
pg_restore "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists backups/mnemosyne-….dump.gz
```

- `--clean --if-exists` drops existing objects (tables, views, functions, …)
  in the **target database only** before recreating them from the archive. Use a
  dedicated restore target (see §6) — it never touches other databases.
- Plain-text SQL dumps are restored via `gzip -dc … | psql "$DATABASE_URL"`.

---

## 5. Verification in isolation (scratch database)

Always prove a restore works against a throwaway database before relying on it
in an incident. Example on a local Postgres:

```bash
# 1. Create a scratch database (do NOT touch the production data).
createdb mnemosyne_scratch

# 2. Restore the latest backup into it.
DATABASE_URL='postgresql://localhost/mnemosyne_scratch' \
  ./scripts/restore.sh backups/mnemosyne-20250801T013000Z.dump.gz

# 3. Sanity-check row counts vs. production expectations, e.g.:
psql 'postgresql://localhost/mnemosyne_scratch' -c \
  "SELECT (SELECT count(*) FROM memories) AS memories, (SELECT count(*) FROM users) AS users;"

# 4. Run the app's read-path against the scratch database (optional, dev only)
#     and confirm key tables exist:
psql 'postgresql://localhost/mnemosyne_scratch' -c '\dt'

# 5. Drop the scratch DB when done.
dropdb mnemosyne_scratch
```

---

## 6. ⛔ Live restoration drill — NOT yet executed

**A live restoration drill has NOT yet been executed.** The restore procedure is
defined and the scripts are written, but until a real backup has been restored
into a scratch database and verified end-to-end (including row-count checks and
an app read-path pointing at the restored database), the restore path must be
treated as **UNVERIFIED**.

Before declaring the capability production-ready, run:

1. `./scripts/backup.sh` against the real database.
2. `./scripts/restore.sh --dry-run` on that backup.
3. A full restore into a scratch database (§5) and compare counts with the live
   source.
4. Optionally boot the app against the scratch DB and smoke-test a read route.

---

## 7. Disaster recovery runbook

1. **Confirm scope.** You are restoring the single MNEMOSYNE database.
2. **Pick the latest healthy archive** in `$BACKUP_DIR` (or the nearest to the
   RPO point you need).
3. **Validate it** with `--dry-run`.
4. **Create a scratch restore target** and restore there first (§5). If it
   clears, you are ready.
5. **Restore to the target** (or create a fresh DB and restore into it).
6. **Verify** row counts and key tables before repointing the app.
7. **Repoint the app** by updating `DATABASE_URL` (Vercel environment
   settings / config) and redeploying.
8. **Record** the incident in the audit log and re-run the next daily backup.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `required tool 'pg_dump' not found` | Install Postgres client tools (`postgresql-client` / `libpq`). |
| `set DATABASE_URL (or PGDATABASE with PG* env)` | Export the variable. The scripts read it from the environment; they never guess or embed credentials. |
| `unrecognized dump format` | File is not a gzip'd pg_dump archive; use an archive produced by `scripts/backup.sh`. |
| Dry-run OK but real restore fails | Likely target-side privileges/duplicate-object errors; restore into an empty/scratch database and check `--no-owner` notes above. |

---

## 9. Not covered

- **Offsite/cloud copies**: this document covers producing archives on an
  operator host. Shipping them offsite (object storage, another region) is
  outside this capability and recommended before relying on backups in a real
  outage.
- **PITR (point-in-time recovery)**: continuous WAL archiving is not configured;
  the daily dump defines the RPO.
- **Encryption at rest of archives**: pipe `gzip` through your own encryption
  layer if the host requires it.
