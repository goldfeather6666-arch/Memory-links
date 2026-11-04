-- ============================================================================
-- MNEMOSYNE — add RLS write policies for memory_entities
-- ----------------------------------------------------------------------------
-- Root cause: memory_entities has RLS ENABLED but only a SELECT policy
-- (entities_select). The demo seeding engine (and any memory->entity linking)
-- inserts into memory_entities, which was silently denied under the app's
-- RLS-enforcing role, aborting the whole seeding transaction and rolling back
-- every demo row -> no demo workspace ever appears.
--
-- This adds INSERT / UPDATE / DELETE policies scoped to the owning memory's
-- workspace (via workspace_policy_ok), mirroring the pattern used for
-- memory_relationships. Additive and idempotent; does not alter or reset data.
-- ============================================================================

-- INSERT: allowed when the linked memory's workspace is accessible.
DROP POLICY IF EXISTS memory_entities_insert ON memory_entities;
CREATE POLICY memory_entities_insert ON memory_entities FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id = memory_entities.memory_id
      AND workspace_policy_ok(mr.workspace_id)));

-- UPDATE: allowed when the linked memory's workspace is accessible.
DROP POLICY IF EXISTS memory_entities_update ON memory_entities;
CREATE POLICY memory_entities_update ON memory_entities FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id = memory_entities.memory_id
      AND workspace_policy_ok(mr.workspace_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id = memory_entities.memory_id
      AND workspace_policy_ok(mr.workspace_id)));

-- DELETE: allowed when the linked memory's workspace is accessible.
DROP POLICY IF EXISTS memory_entities_delete ON memory_entities;
CREATE POLICY memory_entities_delete ON memory_entities FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM memory_records mr
    WHERE mr.id = memory_entities.memory_id
      AND workspace_policy_ok(mr.workspace_id)));
