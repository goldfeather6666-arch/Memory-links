-- ============================================================================
-- MNEMOSYNE — Part 5 knowledge graph schema
-- ----------------------------------------------------------------------------
-- Adds graph snapshots for reproducible/historical visualization. The graph
-- itself is NOT stored separately: nodes derive from `entities` and
-- `memory_records`, edges from `memory_relationships` plus reference links
-- between memories and entities (memory_entities -> entities). A snapshot
-- records a point-in-time projection (node/edge id sets + filter) so it can
-- be re-rendered or shared.
-- ============================================================================

CREATE TABLE IF NOT EXISTS graph_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  mode         text NOT NULL DEFAULT 'universe'
               CHECK (mode IN ('universe','project','person','topic','timeline','focus')),
  node_ids     uuid[] NOT NULL DEFAULT '{}',
  edge_ids     uuid[] NOT NULL DEFAULT '{}',
  filter       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_snapshots_workspace ON graph_snapshots(workspace_id, created_at);

DROP TRIGGER IF EXISTS graph_snapshots_updated_at ON graph_snapshots;
CREATE TRIGGER graph_snapshots_updated_at BEFORE UPDATE ON graph_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE graph_snapshots ENABLE ROW LEVEL SECURITY;

-- node_ids holds polymorphic entity + memory uuids, so no FK constraints are
-- added to the array itself.

CREATE POLICY snapshots_select ON graph_snapshots FOR SELECT
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY snapshots_insert ON graph_snapshots FOR INSERT
  WITH CHECK (owner_id = app_current_user_id());
CREATE POLICY snapshots_update ON graph_snapshots FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
CREATE POLICY snapshots_delete ON graph_snapshots FOR DELETE
  USING (workspace_policy_ok(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
