-- ============================================================================
-- MNEMOSYNE — Part 6 conversational intelligence schema ("Ask Your Past")
-- ----------------------------------------------------------------------------
-- Adds conversations, conversation messages, per-workspace chat settings and
-- (optionally) encrypted BYOK provider keys. All tables get RLS + grants
-- mirroring prior parts; every server operation is additionally gated on
-- workspace membership via userHasWorkspaceAccess.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  summary      text,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','archived')),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_title ON conversations USING gin (to_tsvector('english', title));

-- ---------------------------------------------------------------------------
-- Conversation messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text NOT NULL,
  tokens          integer,
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','streaming','completed','failed','retryable','cancelled')),
  error           text,
  client_request_id text,
  parent_id       uuid REFERENCES conversation_messages(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON conversation_messages(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_request ON conversation_messages(owner_id, workspace_id, client_request_id) WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Per-workspace chat settings (single row per workspace)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_settings (
  workspace_id           uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  automatic_memory_capture boolean NOT NULL DEFAULT false,
  model_preference       text,
  budget_cap_tokens      integer NOT NULL DEFAULT 200000,
  allow_streaming        boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- BYOK provider keys (encrypted at rest; never returned to the browser)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_provider_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  encrypted_key  text NOT NULL,
  key_fingerprint text NOT NULL,
  model          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS conversation_messages_updated_at ON conversation_messages;
CREATE TRIGGER conversation_messages_updated_at BEFORE UPDATE ON conversation_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS chat_settings_updated_at ON chat_settings;
CREATE TRIGGER chat_settings_updated_at BEFORE UPDATE ON chat_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS chat_provider_keys_updated_at ON chat_provider_keys;
CREATE TRIGGER chat_provider_keys_updated_at BEFORE UPDATE ON chat_provider_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security + policies + grants
-- ---------------------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (workspace_policy_ok(workspace_id));
CREATE POLICY conversations_delete ON conversations FOR DELETE USING (workspace_policy_ok(workspace_id));

CREATE POLICY messages_select ON conversation_messages FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY messages_insert ON conversation_messages FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY messages_update ON conversation_messages FOR UPDATE USING (workspace_policy_ok(workspace_id));
CREATE POLICY messages_delete ON conversation_messages FOR DELETE USING (workspace_policy_ok(workspace_id));

CREATE POLICY chat_settings_select ON chat_settings FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY chat_settings_insert ON chat_settings FOR INSERT WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY chat_settings_update ON chat_settings FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY chat_keys_select ON chat_provider_keys FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY chat_keys_insert ON chat_provider_keys FOR INSERT WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY chat_keys_update ON chat_provider_keys FOR UPDATE USING (workspace_policy_ok(workspace_id));
CREATE POLICY chat_keys_delete ON chat_provider_keys FOR DELETE USING (workspace_policy_ok(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
