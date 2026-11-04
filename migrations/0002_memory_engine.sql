-- ============================================================================
-- MNEMOSYNE — Part 3 memory engine schema
-- ----------------------------------------------------------------------------
-- Adds ingestion records, an in-database job queue, memory lifecycle state,
-- version history, entity tables, full-text search, and a guarded pgvector
-- HNSW index. All new tables get RLS + grants. The application data layer
-- remains the primary authorization control (the app role owns the tables).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ingestion records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type    text NOT NULL,
  source_id      text,
  title          text,
  checksum       text NOT NULL,
  content_preview text NOT NULL,
  content_ref    text,
  size_bytes     bigint NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','completed','failed','retryable')),
  error          text,
  attempts       integer NOT NULL DEFAULT 0,
  processed_at   timestamptz,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_workspace_status ON ingestion_records(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_idem ON ingestion_records(workspace_id, source_type, source_id, checksum);

-- ---------------------------------------------------------------------------
-- In-database job queue (no Redis). Atomic claim via UPDATE ... RETURNING.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('extraction','embedding')),
  target_id    uuid NOT NULL,
  state        text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending','running','completed','failed','retryable','cancelled')),
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_by     text,
  locked_at     timestamptz,
  last_error    text,
  timeout_after timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_ready ON processing_jobs(state, run_after);
CREATE INDEX IF NOT EXISTS idx_jobs_kind_target ON processing_jobs(kind, target_id);

-- ---------------------------------------------------------------------------
-- Memory records: lifecycle columns + full-text search + versioning
-- ---------------------------------------------------------------------------
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active'
  CHECK (state IN ('pending','processing','active','needs_review','archived','deleted'));
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS embedding_dim integer;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_memory_search ON memory_records USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_memory_state ON memory_records(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_memory_version ON memory_records(workspace_id, version);

-- ---------------------------------------------------------------------------
-- Memory version history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id    uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  content      text NOT NULL,
  summary      text,
  memory_type  text NOT NULL,
  confidence   numeric(5,4),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, version)
);
CREATE INDEX IF NOT EXISTS idx_memory_versions_memory ON memory_versions(memory_id);

-- ---------------------------------------------------------------------------
-- Memory entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_entities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id    uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_value text NOT NULL,
  confidence   numeric(5,4),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_entities_memory ON memory_entities(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_entities_value ON memory_entities(entity_type, entity_value);

-- ---------------------------------------------------------------------------
-- Guarded pgvector HNSW index (created only when the extension is available).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_memory_embedding
      ON memory_records USING hnsw (embedding vector_cosine_ops);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable; skipping HNSW embedding index';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at triggers for new tables
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS ingestion_updated_at ON ingestion_records;
CREATE TRIGGER ingestion_updated_at BEFORE UPDATE ON ingestion_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS jobs_updated_at ON processing_jobs;
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON processing_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE ingestion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingestion_select ON ingestion_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM workspaces w
                 WHERE w.id = ingestion_records.workspace_id
                   AND (w.owner_id = app_current_user_id()
                        OR EXISTS (SELECT 1 FROM workspace_members wm
                                   WHERE wm.workspace_id = w.id
                                     AND wm.user_id = app_current_user_id()))));
CREATE POLICY ingestion_insert ON ingestion_records FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY ingestion_update ON ingestion_records FOR UPDATE
  USING (owner_id = app_current_user_id());

CREATE POLICY jobs_select ON processing_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM workspaces w
                 WHERE w.id = processing_jobs.workspace_id
                   AND (w.owner_id = app_current_user_id()
                        OR EXISTS (SELECT 1 FROM workspace_members wm
                                   WHERE wm.workspace_id = w.id
                                     AND wm.user_id = app_current_user_id()))));
CREATE POLICY jobs_insert ON processing_jobs FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());

CREATE POLICY versions_select ON memory_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM memory_records mr
                 WHERE mr.id = memory_versions.memory_id
                   AND EXISTS (SELECT 1 FROM workspaces w
                              WHERE w.id = mr.workspace_id
                                AND (w.owner_id = app_current_user_id()
                                     OR EXISTS (SELECT 1 FROM workspace_members wm
                                                WHERE wm.workspace_id = w.id
                                                  AND wm.user_id = app_current_user_id())))));

CREATE POLICY entities_select ON memory_entities FOR SELECT
  USING (EXISTS (SELECT 1 FROM memory_records mr
                 WHERE mr.id = memory_entities.memory_id
                   AND EXISTS (SELECT 1 FROM workspaces w
                              WHERE w.id = mr.workspace_id
                                AND (w.owner_id = app_current_user_id()
                                     OR EXISTS (SELECT 1 FROM workspace_members wm
                                                WHERE wm.workspace_id = w.id
                                                  AND wm.user_id = app_current_user_id())))));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
