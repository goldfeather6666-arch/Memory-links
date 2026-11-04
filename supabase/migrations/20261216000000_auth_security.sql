-- Supabase mirror of migrations/0009_auth_security.sql
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

CREATE POLICY auth_attempts_select ON auth_attempts FOR SELECT USING (true);
CREATE POLICY auth_attempts_insert ON auth_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY auth_attempts_update ON auth_attempts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY auth_attempts_delete ON auth_attempts FOR DELETE USING (true);

-- In Supabase, the `authenticated` role must be able to read/write attempts;
-- grant both app roles for consistency with the Data API model.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_attempts TO anon, authenticated, service_role;
