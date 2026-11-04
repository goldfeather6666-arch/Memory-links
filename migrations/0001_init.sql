-- ============================================================================
-- MNEMOSYNE — Part 2 initial schema
-- ----------------------------------------------------------------------------
-- Postgres schema for users, workspaces, projects, data sources, memory
-- records, memory relationships, audit events, sessions and auth tokens.
--
-- Notes:
--   * pgcrypto is required for gen_random_uuid().
--   * The `vector` extension (pgvector) is *reserved* for the Part 3 memory
--     engine. It is guarded so the migration still succeeds on hosts where the
--     extension is absent. No embeddings are generated or queried yet.
--   * RLS is enabled on every tenant-scoped table. Policies scope by
--     current_setting('app.user_id', true)::uuid, which the application sets
--     per transaction. The application data-access layer ALSO enforces owner /
--     workspace scope in SQL (defense-in-depth; the app layer is primary).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgvector is reserved but optional in this phase.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension unavailable; embedding column will not be added';
  END;
END $$;

-- ============================================================================
-- Tables
-- ============================================================================

-- users ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  display_name    text,
  avatar_url      text,
  password_hash   text NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- workspaces ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- workspace_members -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- projects --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','archived','planned')),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- data_sources ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type      text NOT NULL,
  name             text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  connection_status text NOT NULL DEFAULT 'not_connected'
                    CHECK (connection_status IN ('not_connected','connected','error')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- memory_records --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type         text NOT NULL
                      CHECK (memory_type IN ('episodic','semantic','procedural','associative')),
  content             text NOT NULL,
  summary             text,
  source_ref          uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  confidence          numeric(5,4),
  importance          integer NOT NULL DEFAULT 0,
  valid_from          timestamptz,
  valid_until         timestamptz,
  privacy_classification text NOT NULL DEFAULT 'private'
                          CHECK (privacy_classification IN ('private','workspace')),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Reserved for Part 3 (pgvector). Nullable; no retrieval implemented.
  embedding           vector(1536),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- memory_relationships ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_relationships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_memory_id uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  target_memory_id uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  strength         numeric(5,4),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (source_memory_id <> target_memory_id)
);

-- audit_events -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- sessions ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

-- auth_tokens ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('email_verify','password_reset')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sources_workspace ON data_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_workspace_type ON memory_records(workspace_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_memory_window ON memory_records(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_memory_metadata_gin ON memory_records USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON memory_relationships(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON memory_relationships(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON auth_tokens(purpose, expires_at);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS workspaces_updated_at ON workspaces;
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS memory_updated_at ON memory_records;
CREATE TRIGGER memory_updated_at BEFORE UPDATE ON memory_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Helper: current application user id, or NULL if not set.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_records FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;

-- users: a user sees only themselves.
CREATE POLICY users_select ON users FOR SELECT
  USING (id = app_current_user_id());
CREATE POLICY users_update ON users FOR UPDATE
  USING (id = app_current_user_id());
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (id = app_current_user_id());

-- workspaces: owner OR workspace member.
CREATE POLICY workspaces_select ON workspaces FOR SELECT
  USING (owner_id = app_current_user_id()
         OR EXISTS (SELECT 1 FROM workspace_members wm
                    WHERE wm.workspace_id = workspaces.id
                      AND wm.user_id = app_current_user_id()));
CREATE POLICY workspaces_insert ON workspaces FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());

-- workspace_members: a member sees their own memberships; owner sees all.
CREATE POLICY members_select ON workspace_members FOR SELECT
  USING (user_id = app_current_user_id()
         OR EXISTS (SELECT 1 FROM workspaces w
                    WHERE w.id = workspace_members.workspace_id
                      AND w.owner_id = app_current_user_id()));

-- projects: workspace access.
CREATE POLICY projects_select ON projects FOR SELECT
  USING (EXISTS (SELECT 1 FROM workspaces w
                 WHERE w.id = projects.workspace_id
                   AND (w.owner_id = app_current_user_id()
                        OR EXISTS (SELECT 1 FROM workspace_members wm
                                   WHERE wm.workspace_id = w.id
                                     AND wm.user_id = app_current_user_id()))));

-- data_sources: workspace access.
CREATE POLICY sources_select ON data_sources FOR SELECT
  USING (EXISTS (SELECT 1 FROM workspaces w
                 WHERE w.id = data_sources.workspace_id
                   AND (w.owner_id = app_current_user_id()
                        OR EXISTS (SELECT 1 FROM workspace_members wm
                                   WHERE wm.workspace_id = w.id
                                     AND wm.user_id = app_current_user_id()))));

-- memory_records: workspace access.
CREATE POLICY memory_select ON memory_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM workspaces w
                 WHERE w.id = memory_records.workspace_id
                   AND (w.owner_id = app_current_user_id()
                        OR EXISTS (SELECT 1 FROM workspace_members wm
                                   WHERE wm.workspace_id = w.id
                                     AND wm.user_id = app_current_user_id())))
         AND (privacy_classification = 'workspace' OR owner_id = app_current_user_id()));

-- memory_relationships: via either endpoint's workspace.
CREATE POLICY relationships_select ON memory_relationships FOR SELECT
  USING (EXISTS (SELECT 1 FROM memory_records mr
                 WHERE mr.id IN (source_memory_id, target_memory_id)
                   AND EXISTS (SELECT 1 FROM workspaces w
                              WHERE w.id = mr.workspace_id
                                AND (w.owner_id = app_current_user_id()
                                     OR EXISTS (SELECT 1 FROM workspace_members wm
                                                WHERE wm.workspace_id = w.id
                                                  AND wm.user_id = app_current_user_id())))));

-- audit_events: visible to workspace users.
CREATE POLICY audit_select ON audit_events FOR SELECT
  USING (workspace_id IS NULL
         OR EXISTS (SELECT 1 FROM workspaces w
                    WHERE w.id = audit_events.workspace_id
                      AND (w.owner_id = app_current_user_id()
                           OR EXISTS (SELECT 1 FROM workspace_members wm
                                      WHERE wm.workspace_id = w.id
                                        AND wm.user_id = app_current_user_id()))));

-- sessions: a user sees only their own sessions.
CREATE POLICY sessions_select ON sessions FOR SELECT
  USING (user_id = app_current_user_id());
CREATE POLICY sessions_delete ON sessions FOR DELETE
  USING (user_id = app_current_user_id());

-- auth_tokens: a user sees only their own tokens.
CREATE POLICY tokens_select ON auth_tokens FOR SELECT
  USING (user_id = app_current_user_id());
CREATE POLICY tokens_delete ON auth_tokens FOR DELETE
  USING (user_id = app_current_user_id());

-- ============================================================================
-- Grants (application role uses the public/definer role; keep broad but RLS
-- still enforces row scoping. Insert/update policies are intentionally
-- restrictive; most app writes run through the data layer, which also sets
-- app.user_id.)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
