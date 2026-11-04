-- ============================================================================
-- MNEMOSYNE — Part 7 universal agent bridge schema
-- ----------------------------------------------------------------------------
-- Adds the agent registry, hash-only credentials, granular per-workspace
-- permissions, memory contributions (proposals/decisions), webhook
-- subscriptions + delivery logs, per-agent usage and agent audit events.
-- Every server operation is additionally gated on workspace membership via
-- userHasWorkspaceAccess; agent credentials are stored as SHA-256 hashes and
-- never exposed after issuance. Webhook signing secrets are stored encrypted
-- at rest (server-side AES-GCM) and never returned to the browser.
-- ============================================================================

-- Agents --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'custom'
                  CHECK (category IN ('coding','research','browser','personal_assistant','productivity','creative','custom')),
  integration_type text NOT NULL DEFAULT 'mcp',
  auth_method     text NOT NULL DEFAULT 'bearer_token',
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','revoked')),
  mode            text NOT NULL DEFAULT 'approval'
                  CHECK (mode IN ('read_only','approval','autonomous')),
  last_active_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);

-- Credentials (hash-only at rest) ------------------------------------------
CREATE TABLE IF NOT EXISTS agent_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash    text NOT NULL,
  token_prefix  text NOT NULL,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_credentials_hash ON agent_credentials(token_hash);
CREATE INDEX IF NOT EXISTS idx_agent_credentials_agent ON agent_credentials(agent_id);

-- Granular per-workspace permissions ---------------------------------------
CREATE TABLE IF NOT EXISTS agent_workspace_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scopes      text[] NOT NULL DEFAULT '{}',
  memory_types text[] NOT NULL DEFAULT '{}',
  project_ids uuid[] NOT NULL DEFAULT '{}',
  read_only   boolean NOT NULL DEFAULT true,
  UNIQUE (agent_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_perms_agent ON agent_workspace_permissions(agent_id);

-- Memory contributions / proposals ------------------------------------------
CREATE TABLE IF NOT EXISTS agent_contributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('memory','relationship','update','delete')),
  payload        jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','auto_approved','error')),
  memory_id      uuid REFERENCES memory_records(id) ON DELETE SET NULL,
  source_name    text,
  source_detail  jsonb,
  duplicate_of   uuid REFERENCES memory_records(id) ON DELETE SET NULL,
  conflict_note  text,
  decision_actor text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_contributions_workspace ON agent_contributions(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_contributions_agent ON agent_contributions(agent_id);

-- Webhook subscriptions (secrets encrypted at rest) -------------------------
CREATE TABLE IF NOT EXISTS agent_webhook_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  url         text NOT NULL,
  secret_enc  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  events      text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_workspace ON agent_webhook_subscriptions(workspace_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES agent_webhook_subscriptions(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL,
  event            text NOT NULL,
  request_url      text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','delivered','failed','retrying')),
  attempt          integer NOT NULL DEFAULT 1,
  status_code      integer,
  response_body    text,
  idempotency_key  text NOT NULL,
  next_attempt_at  timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id, created_at);

-- Per-agent usage accounting -------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  operation   text NOT NULL,
  count       integer NOT NULL DEFAULT 1,
  bytes       integer NOT NULL DEFAULT 0,
  day         date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (agent_id, workspace_id, day, operation)
);

-- Agent audit events ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_audit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  action      text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON agent_audit_events(agent_id, created_at DESC);

-- updated_at triggers --------------------------------------------------------
DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS agent_webhook_subscriptions_updated_at ON agent_webhook_subscriptions;
CREATE TRIGGER agent_webhook_subscriptions_updated_at BEFORE UPDATE ON agent_webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security + policies + grants -------------------------------------
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workspace_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_select ON agents FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY agents_insert ON agents FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY agents_update ON agents FOR UPDATE USING (workspace_policy_ok(workspace_id));
CREATE POLICY agents_delete ON agents FOR DELETE USING (workspace_policy_ok(workspace_id));

CREATE POLICY agent_credentials_select ON agent_credentials FOR SELECT USING (
  EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_credentials.agent_id AND workspace_policy_ok(a.workspace_id)));
CREATE POLICY agent_credentials_insert ON agent_credentials FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_credentials.agent_id AND a.owner_id = app_current_user_id()));
CREATE POLICY agent_credentials_update ON agent_credentials FOR UPDATE USING (
  EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_credentials.agent_id AND workspace_policy_ok(a.workspace_id)));
CREATE POLICY agent_credentials_delete ON agent_credentials FOR DELETE USING (
  EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_credentials.agent_id AND workspace_policy_ok(a.workspace_id)));

CREATE POLICY agent_perms_select ON agent_workspace_permissions FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY agent_perms_insert ON agent_workspace_permissions FOR INSERT
  WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY agent_perms_update ON agent_workspace_permissions FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY agent_perms_delete ON agent_workspace_permissions FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY contributions_select ON agent_contributions FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY contributions_insert ON agent_contributions FOR INSERT
  WITH CHECK (owner_id = app_current_user_id() OR workspace_policy_ok(workspace_id));
CREATE POLICY contributions_update ON agent_contributions FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY contributions_delete ON agent_contributions FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY webhook_subs_select ON agent_webhook_subscriptions FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY webhook_subs_insert ON agent_webhook_subscriptions FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY webhook_subs_update ON agent_webhook_subscriptions FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY webhook_subs_delete ON agent_webhook_subscriptions FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY deliveries_select ON webhook_deliveries FOR SELECT
  USING (EXISTS (SELECT 1 FROM agent_webhook_subscriptions s WHERE s.id = webhook_deliveries.subscription_id AND workspace_policy_ok(s.workspace_id)));
CREATE POLICY deliveries_insert ON webhook_deliveries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM agent_webhook_subscriptions s WHERE s.id = webhook_deliveries.subscription_id AND workspace_policy_ok(s.workspace_id)));
CREATE POLICY deliveries_update ON webhook_deliveries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM agent_webhook_subscriptions s WHERE s.id = webhook_deliveries.subscription_id AND workspace_policy_ok(s.workspace_id)));
CREATE POLICY deliveries_delete ON webhook_deliveries FOR DELETE USING (
  EXISTS (SELECT 1 FROM agent_webhook_subscriptions s WHERE s.id = webhook_deliveries.subscription_id AND workspace_policy_ok(s.workspace_id)));

CREATE POLICY agent_usage_select ON agent_usage FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY agent_usage_insert ON agent_usage FOR INSERT
  WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY agent_usage_update ON agent_usage FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY agent_usage_delete ON agent_usage FOR DELETE
  USING (workspace_policy_ok(workspace_id));

CREATE POLICY agent_audit_select ON agent_audit_events FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY agent_audit_insert ON agent_audit_events FOR INSERT
  WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY agent_audit_delete ON agent_audit_events FOR DELETE
  USING (workspace_policy_ok(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
