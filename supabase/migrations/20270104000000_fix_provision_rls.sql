-- ============================================================================
-- MNEMOSYNE — fix Supabase-auth provisioning + complete RLS write policies
-- ----------------------------------------------------------------------------
-- Root causes fixed here:
--   1. Password is managed by Supabase Auth, so the local `users.password_hash`
--      must be nullable: the NOT NULL constraint made provisionUserRow() fail,
--      so no `users` row existed for Supabase-auth users and workspace creation
--      failed on the `workspaces.owner_id` foreign key.
--   2. Several tenant tables had SELECT-only RLS policies. Under a connection
--      role that does not own/bypass the tables, INSERT/UPDATE/DELETE were
--      silently denied, breaking workspace/project/memory writes. The app sets
--      app.user_id per transaction (set_config), so policies scope on that.
-- Additive and idempotent; does not alter or reset existing data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow Supabase-managed users (no local password hash)
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Complete RLS write policies
-- ---------------------------------------------------------------------------
-- workspaces: owner may update / delete.
DROP POLICY IF EXISTS workspaces_update ON workspaces;
CREATE POLICY workspaces_update ON workspaces FOR UPDATE
  USING (owner_id = app_current_user_id())
  WITH CHECK (owner_id = app_current_user_id());
DROP POLICY IF EXISTS workspaces_delete ON workspaces;
CREATE POLICY workspaces_delete ON workspaces FOR DELETE
  USING (owner_id = app_current_user_id());

-- workspace_members: owner/admin manage membership.
DROP POLICY IF EXISTS members_insert ON workspace_members;
CREATE POLICY members_insert ON workspace_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_id
      AND (w.owner_id = app_current_user_id()
           OR EXISTS (SELECT 1 FROM workspace_members wm
                      WHERE wm.workspace_id = w.id
                        AND wm.user_id = app_current_user_id()
                        AND wm.role IN ('owner','admin')))));
DROP POLICY IF EXISTS members_update ON workspace_members;
CREATE POLICY members_update ON workspace_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_id
      AND (w.owner_id = app_current_user_id()
           OR EXISTS (SELECT 1 FROM workspace_members wm
                      WHERE wm.workspace_id = w.id
                        AND wm.user_id = app_current_user_id()
                        AND wm.role IN ('owner','admin')))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_id
      AND (w.owner_id = app_current_user_id()
           OR EXISTS (SELECT 1 FROM workspace_members wm
                      WHERE wm.workspace_id = w.id
                        AND wm.user_id = app_current_user_id()
                        AND wm.role IN ('owner','admin')))));
DROP POLICY IF EXISTS members_delete ON workspace_members;
CREATE POLICY members_delete ON workspace_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_id
      AND (w.owner_id = app_current_user_id()
           OR EXISTS (SELECT 1 FROM workspace_members wm
                      WHERE wm.workspace_id = w.id
                        AND wm.user_id = app_current_user_id()
                        AND wm.role IN ('owner','admin')))));

-- projects: any workspace member with access can create/update/delete.
DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS projects_update ON projects;
CREATE POLICY projects_update ON projects FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS projects_delete ON projects;
CREATE POLICY projects_delete ON projects FOR DELETE
  USING (workspace_policy_ok(workspace_id));

-- data_sources: workspace access.
DROP POLICY IF EXISTS sources_insert ON data_sources;
CREATE POLICY sources_insert ON data_sources FOR INSERT
  WITH CHECK (workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS sources_update ON data_sources;
CREATE POLICY sources_update ON data_sources FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS sources_delete ON data_sources;
CREATE POLICY sources_delete ON data_sources FOR DELETE
  USING (workspace_policy_ok(workspace_id));

-- memory_records: owner writes; workspace access scopes update/delete.
DROP POLICY IF EXISTS memory_insert ON memory_records;
CREATE POLICY memory_insert ON memory_records FOR INSERT
  WITH CHECK (owner_id = app_current_user_id() AND workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS memory_update ON memory_records;
CREATE POLICY memory_update ON memory_records FOR UPDATE
  USING (workspace_policy_ok(workspace_id));
DROP POLICY IF EXISTS memory_delete ON memory_records;
CREATE POLICY memory_delete ON memory_records FOR DELETE
  USING (workspace_policy_ok(workspace_id));

-- memory_relationships: access via either endpoint memory's workspace.
DROP POLICY IF EXISTS relationships_insert ON memory_relationships;
CREATE POLICY relationships_insert ON memory_relationships FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id IN (source_memory_id, target_memory_id)
      AND workspace_policy_ok(mr.workspace_id)));
DROP POLICY IF EXISTS relationships_delete ON memory_relationships;
CREATE POLICY relationships_delete ON memory_relationships FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id IN (source_memory_id, target_memory_id)
      AND workspace_policy_ok(mr.workspace_id)));

-- audit_events: actor or workspace member may record.
DROP POLICY IF EXISTS audit_insert ON audit_events;
CREATE POLICY audit_insert ON audit_events FOR INSERT
  WITH CHECK (actor_id = app_current_user_id()
             OR workspace_id IS NULL
             OR workspace_policy_ok(workspace_id));

-- auth_tokens: user-scoped.
DROP POLICY IF EXISTS tokens_insert ON auth_tokens;
CREATE POLICY tokens_insert ON auth_tokens FOR INSERT
  WITH CHECK (user_id = app_current_user_id());
DROP POLICY IF EXISTS tokens_update ON auth_tokens;
CREATE POLICY tokens_update ON auth_tokens FOR UPDATE
  USING (user_id = app_current_user_id());

-- sessions: user-scoped (legacy; Supabase Auth is primary).
DROP POLICY IF EXISTS sessions_insert ON sessions;
CREATE POLICY sessions_insert ON sessions FOR INSERT
  WITH CHECK (user_id = app_current_user_id());
DROP POLICY IF EXISTS sessions_update ON sessions;
CREATE POLICY sessions_update ON sessions FOR UPDATE
  USING (user_id = app_current_user_id());
