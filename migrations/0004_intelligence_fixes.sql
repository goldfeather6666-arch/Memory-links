-- ============================================================================
-- MNEMOSYNE — Part 4 fixes (temporal version validity + fractional importance)
-- ----------------------------------------------------------------------------
-- Two additive schema changes required by the intelligence engine:
--   1. memory_versions gains valid_from/valid_until so historical retrieval can
--      answer "what was true at time T" at the version level.
--   2. memory_records.importance becomes numeric(5,4) (0..1) so explainable
--      fractional importance scores persist without integer truncation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Temporal validity on version history
-- ---------------------------------------------------------------------------
ALTER TABLE memory_versions ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE memory_versions ADD COLUMN IF NOT EXISTS valid_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_memory_versions_window ON memory_versions(memory_id, version);

-- ---------------------------------------------------------------------------
-- 2. Fractional importance (0..1), preserving any existing integer values by
--    clamping into range (current default is 0; no caller stores >1 today).
-- ---------------------------------------------------------------------------
ALTER TABLE memory_records ALTER COLUMN importance TYPE numeric(5,4)
  USING (GREATEST(0, LEAST(1, importance::numeric)));
ALTER TABLE memory_records ALTER COLUMN importance SET DEFAULT 0;
