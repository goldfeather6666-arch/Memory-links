# Database migrations

Migrations are plain SQL files in this directory. They are applied in filename
order by `node scripts/migrate.mjs`. Applied files are tracked in the
`schema_migrations` table, so re-running the script is safe and idempotent.

Each file must be named with a zero-padded numeric prefix (e.g. `0001_init.sql`)
that reflects its intended order. Never edit an already-applied migration -
write a new one instead.

## Running

```bash
DATABASE_URL=postgres://... node scripts/migrate.mjs
```

Requires the `pg` npm package. It will create the `schema_migrations` tracking
table if it does not exist.

## Notes

- Migration `0002_memory_engine.sql` adds the memory engine schema: ingestion
  records, an in-database job queue (`processing_jobs`), lifecycle state +
  version columns on `memory_records`, `memory_versions`, `memory_entities`,
  a functional GIN full-text index, and a guarded pgvector HNSW index (created
  only when the extension is available).
- Row-level security is enabled on all tenant tables. The application sets
  `app.user_id` per connection; policies read it to scope rows to the acting
  user.
