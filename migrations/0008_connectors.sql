-- ============================================================================
-- MNEMOSYNE — Part 8 universal data connector schema
-- ----------------------------------------------------------------------------
-- Adds connection management for external providers: encrypted OAuth token
-- storage, a unified per-provider source record, sync-run history and OAuth
-- state for PKCE flows. Also extends the job queue kind constraint so
-- connector sync runs can reuse the existing in-database job machinery. All
-- new tables get RLS + grants matching the app conventions.
-- ============================================================================

-- Connections ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           text NOT NULL,
  external_account_id text NOT NULL,
  account_name       text,
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'not_connected'
                     CHECK (status IN ('not_connected','awaiting','connected','syncing','paused','expired','failed','disconnected')),
  scope              text[] NOT NULL DEFAULT '{}',
  selected_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_interval_min  integer,
  last_sync_at       timestamptz,
  next_sync_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, external_account_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_workspace ON connections(workspace_id, status);

-- Encrypted OAuth tokens -----------------------------------------------------
CREATE TABLE IF NOT EXISTS connection_tokens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  access_token_enc  text NOT NULL,
  refresh_token_enc text,
  expires_at        timestamptz,
  scope             text[] NOT NULL DEFAULT '{}',
  token_type        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connection_tokens_conn ON connection_tokens(connection_id);

-- Unified source records (dedupe per connection + external id) ---------------
CREATE TABLE IF NOT EXISTS connection_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id      text NOT NULL,
  record_type      text NOT NULL,
  title            text,
  url              text,
  parent_id        text,
  thread_id        text,
  author           text,
  content_hash     text,
  source_timestamp timestamptz,
  modified_at      timestamptz,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','deleted','moved')),
  last_ingestion_id uuid REFERENCES ingestion_records(id) ON DELETE SET NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_synced     timestamptz,
  UNIQUE (connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_conn_sources_workspace ON connection_sources(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_conn_sources_conn ON connection_sources(connection_id, status);

-- Sync runs -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger           text NOT NULL DEFAULT 'manual'
                    CHECK (trigger IN ('manual','scheduled','webhook','initial')),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed')),
  records_discovered integer NOT NULL DEFAULT 0,
  records_imported   integer NOT NULL DEFAULT 0,
  records_updated    integer NOT NULL DEFAULT 0,
  records_skipped    integer NOT NULL DEFAULT 0,
  records_failed     integer NOT NULL DEFAULT 0,
  error             text,
  started_at        timestamptz,
  finished_at       timestamptz,
  next_run_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_conn ON sync_runs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_workspace ON sync_runs(workspace_id, created_at DESC);

-- OAuth PKCE state ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_states (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  state          text NOT NULL,
  code_challenge text NOT NULL,
  code_verifier  text NOT NULL,
  redirect_to    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- Extend job queue kind to allow connector sync jobs ---------------------------
ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_kind_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_kind_check
  CHECK (kind IN ('extraction','embedding','connector_sync'));

-- updated_at triggers ----------------------------------------------------------
DROP TRIGGER IF EXISTS connections_updated_at ON connections;
CREATE TRIGGER connections_updated_at BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS connection_tokens_updated_at ON connection_tokens;
CREATE TRIGGER connection_tokens_updated_at BEFORE UPDATE ON connection_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security + policies + grants ---------------------------------------
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY connections_select ON connections FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY connections_insert ON connections FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY connections_update ON connections FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY connections_delete ON connections FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY conn_tokens_select ON connection_tokens FOR SELECT
  USING (EXISTS (SELECT 1 FROM connections c WHERE c.id = connection_tokens.connection_id
                 AND workspace_policy_ok(c.workspace_id)));
CREATE POLICY conn_tokens_insert ON connection_tokens FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM connections c WHERE c.id = connection_tokens.connection_id
                 AND c.owner_id = app_current_user_id()));
CREATE POLICY conn_tokens_update ON connection_tokens FOR UPDATE
  USING (EXISTS (SELECT 1 FROM connections c WHERE c.id = connection_tokens.connection_id
                 AND workspace_policy_ok(c.workspace_id)));
CREATE POLICY conn_tokens_delete ON connection_tokens FOR DELETE
  USING (EXISTS (SELECT 1 FROM connections c WHERE c.id = connection_tokens.connection_id
                 AND workspace_policy_ok(c.workspace_id)));

CREATE POLICY conn_sources_select ON connection_sources FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY conn_sources_insert ON connection_sources FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY conn_sources_update ON connection_sources FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY conn_sources_delete ON connection_sources FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY sync_runs_select ON sync_runs FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY sync_runs_insert ON sync_runs FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY sync_runs_update ON sync_runs FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY sync_runs_delete ON sync_runs FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY oauth_states_select ON oauth_states FOR SELECT
  USING (user_id = app_current_user_id());
CREATE POLICY oauth_states_insert ON oauth_states FOR INSERT
  WITH CHECK (user_id = app_current_user_id());
CREATE POLICY oauth_states_delete ON oauth_states FOR DELETE
  USING (user_id = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
