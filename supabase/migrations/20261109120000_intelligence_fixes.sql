-- ============================================================================
-- MNEMOSYNE — Part 4 fixes (temporal version validity + fractional importance)
-- Mirrors migrations/0004_intelligence_fixes.sql for the linked Supabase DB.
-- ============================================================================

ALTER TABLE memory_versions ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE memory_versions ADD COLUMN IF NOT EXISTS valid_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_memory_versions_window ON memory_versions(memory_id, version);

ALTER TABLE memory_records ALTER COLUMN importance TYPE numeric(5,4)
  USING (GREATEST(0, LEAST(1, importance::numeric)));
ALTER TABLE memory_records ALTER COLUMN importance SET DEFAULT 0;
