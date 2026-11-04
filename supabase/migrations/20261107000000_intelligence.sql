-- ============================================================================
-- MNEMOSYNE — Part 4 autonomous memory intelligence schema
-- (mirror of migrations/0003_intelligence.sql for the linked Supabase)
-- Adds temporal metadata, normalized entities/aliases, richer relationships,
-- contradictions, consolidations, patterns, suggestions, an intelligence job
-- queue, per-workspace processing settings and usage/cost accounting.
-- All new tables get RLS + grants mirroring prior parts. Unchanged data is
-- never invented; nullable/empty columns stay null/empty.
-- ============================================================================

ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_memory_occurred ON memory_records(workspace_id, occurred_at);

CREATE TABLE IF NOT EXISTS entities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type    text NOT NULL DEFAULT 'concept'
                 CHECK (entity_type IN
                   ('person','organization','product','project','location','technology','event','concept')),
  canonical_name  text NOT NULL,
  confidence      numeric(5,4),
  provenance      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_type, canonical_name)
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_workspace_type ON entities(workspace_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(lower(canonical_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_unique ON entity_aliases(entity_id, lower(alias));
CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(lower(alias));

ALTER TABLE memory_relationships ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_relationships_type ON memory_relationships(relationship_type);

CREATE TABLE IF NOT EXISTS contradictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id_a     uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  memory_id_b     uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  category        text NOT NULL
                  CHECK (category IN ('genuine','temporal','context','uncertain','duplicate')),
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence      numeric(5,4),
  status          text NOT NULL DEFAULT 'unresolved'
                  CHECK (status IN ('unresolved','resolved_by_newer','resolved_by_user','context_dependent','dismissed')),
  resolution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (memory_id_a <> memory_id_b)
);
CREATE INDEX IF NOT EXISTS idx_contradictions_workspace_status ON contradictions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_contradictions_pair ON contradictions(memory_id_a, memory_id_b);

CREATE TABLE IF NOT EXISTS consolidations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                text NOT NULL
                      CHECK (kind IN ('related','repeated_fact','repeated_preference','project',
                                      'event','decision','change','gap','contradiction','summary')),
  title               text NOT NULL,
  summary             text NOT NULL,
  supporting_memory_ids uuid[] NOT NULL DEFAULT '{}',
  source_refs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence          numeric(5,4),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','superseded','dismissed')),
  meta                jsonb NOT NULL DEFAULT '{}'::jsonb,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consolidations_workspace ON consolidations(workspace_id, kind, created_at);

CREATE TABLE IF NOT EXISTS patterns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_type         text NOT NULL
                       CHECK (pattern_type IN ('frequent_project','repeated_workflow','recurring_problem',
                                              'consistent_preference','frequently_referenced','repeated_decision',
                                              'priority_change','general')),
  description          text NOT NULL,
  supporting_memory_ids uuid[] NOT NULL DEFAULT '{}',
  confidence           numeric(5,4),
  first_observed_at    timestamptz NOT NULL DEFAULT now(),
  last_observed_at     timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','superseded','dismissed')),
  meta                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patterns_workspace ON patterns(workspace_id, status);

CREATE TABLE IF NOT EXISTS suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL
                  CHECK (suggestion_type IN (
                    'related_memories','project_decision_changed','preference_may_be_outdated',
                    'repeated_procedure','same_project_reference','long_term_retention','general')),
  title          text NOT NULL,
  body           text NOT NULL,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','rejected','edited','dismissed','deferred')),
  target_memory_id uuid REFERENCES memory_records(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggestions_workspace_status ON suggestions(workspace_id, status);

CREATE TABLE IF NOT EXISTS intelligence_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL
                 CHECK (kind IN ('consolidation','contradiction','entities','patterns',
                                'importance','suggestions','full_analysis')),
  trigger_type   text NOT NULL DEFAULT 'manual'
                 CHECK (trigger_type IN ('manual','scheduled','incremental','event')),
  state          text NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending','running','completed','failed','retryable','cancelled')),
  attempts       integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_by      text,
  locked_at      timestamptz,
  last_error     text,
  timeout_after  timestamptz NOT NULL DEFAULT now() + interval '120 seconds',
  idempotency_key text UNIQUE,
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_ready ON intelligence_jobs(state, run_after);
CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_workspace ON intelligence_jobs(workspace_id, kind);

CREATE TABLE IF NOT EXISTS processing_settings (
  workspace_id            uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  automatic_consolidation boolean NOT NULL DEFAULT false,
  enabled_kinds           text[] NOT NULL DEFAULT '{consolidation,contradiction,entities,patterns,importance,suggestions}',
  budget_cap_tokens       integer NOT NULL DEFAULT 200000,
  model_preference        text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_accounting (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_kind     text NOT NULL,
  model        text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached       boolean NOT NULL DEFAULT false,
  cost_estimate numeric(12,6) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_accounting(workspace_id, created_at);

DROP TRIGGER IF EXISTS entities_updated_at ON entities;
CREATE TRIGGER entities_updated_at BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS entity_aliases_updated_at ON entity_aliases;
CREATE TRIGGER entity_aliases_updated_at BEFORE UPDATE ON entity_aliases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS contradictions_updated_at ON contradictions;
CREATE TRIGGER contradictions_updated_at BEFORE UPDATE ON contradictions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS consolidations_updated_at ON consolidations;
CREATE TRIGGER consolidations_updated_at BEFORE UPDATE ON consolidations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS patterns_updated_at ON patterns;
CREATE TRIGGER patterns_updated_at BEFORE UPDATE ON patterns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS suggestions_updated_at ON suggestions;
CREATE TRIGGER suggestions_updated_at BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS intelligence_jobs_updated_at ON intelligence_jobs;
CREATE TRIGGER intelligence_jobs_updated_at BEFORE UPDATE ON intelligence_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS processing_settings_updated_at ON processing_settings;
CREATE TRIGGER processing_settings_updated_at BEFORE UPDATE ON processing_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_accounting ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION workspace_policy_ok(ws uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = ws
      AND (w.owner_id = app_current_user_id()
           OR EXISTS (SELECT 1 FROM workspace_members wm
                      WHERE wm.workspace_id = w.id
                        AND wm.user_id = app_current_user_id()))
  );
$$ LANGUAGE sql STABLE;

CREATE POLICY entities_select ON entities FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY entities_insert ON entities FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY entities_update ON entities FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY aliases_select ON entity_aliases FOR SELECT
  USING (workspace_policy_ok((SELECT workspace_id FROM entities WHERE id = entity_id)));
CREATE POLICY aliases_insert ON entity_aliases FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_id AND e.owner_id = app_current_user_id()));
CREATE POLICY aliases_update ON entity_aliases FOR UPDATE
  USING (workspace_policy_ok((SELECT workspace_id FROM entities WHERE id = entity_id)));

CREATE POLICY contradictions_select ON contradictions FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY contradictions_insert ON contradictions FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY contradictions_update ON contradictions FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY consolidations_select ON consolidations FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY consolidations_insert ON consolidations FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY consolidations_update ON consolidations FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY patterns_select ON patterns FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY patterns_insert ON patterns FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY patterns_update ON patterns FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY suggestions_select ON suggestions FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY suggestions_insert ON suggestions FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY suggestions_update ON suggestions FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY intel_jobs_select ON intelligence_jobs FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY intel_jobs_insert ON intelligence_jobs FOR INSERT WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY intel_jobs_update ON intelligence_jobs FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY psettings_select ON processing_settings FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY psettings_insert ON processing_settings FOR INSERT WITH CHECK (workspace_policy_ok(workspace_id));
CREATE POLICY psettings_update ON processing_settings FOR UPDATE USING (workspace_policy_ok(workspace_id));

CREATE POLICY usage_select ON usage_accounting FOR SELECT USING (workspace_policy_ok(workspace_id));
CREATE POLICY usage_insert ON usage_accounting FOR INSERT WITH CHECK (owner_id = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
