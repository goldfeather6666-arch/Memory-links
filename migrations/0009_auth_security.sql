-- ============================================================================
-- MNEMOSYNE — Part 9 authentication security hardening
-- ----------------------------------------------------------------------------
-- Adds a shared, DB-backed rate limiter for the authentication routes (signin,
-- signup, forgot-password, reset-password, verify-email). This prevents brute
-- force logins, spam signups and token enumeration. Keys are opaque (normalized
-- email or client IP), so the table is intentionally decoupled from a specific
-- user/workspace and is governed by permissive policies for the app role
-- (self-managed Postgres model: the app role is the only DB principal).
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket_key       text NOT NULL,
  action           text NOT NULL,
  attempt_count    integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  lockout_level    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  PRIMARY KEY (bucket_key, action)
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_action ON auth_attempts(action);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_locked ON auth_attempts(locked_until) WHERE locked_until IS NOT NULL;

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

-- The app role is the sole DB principal in this self-managed deployment; the
-- rate limiter runs via queryTenant(null, ...). Permissive policies let the
-- app role read/write attempts freely while keeping RLS enabled as a guard.
CREATE POLICY auth_attempts_select ON auth_attempts FOR SELECT USING (true);
CREATE POLICY auth_attempts_insert ON auth_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY auth_attempts_update ON auth_attempts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY auth_attempts_delete ON auth_attempts FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_attempts TO PUBLIC;
