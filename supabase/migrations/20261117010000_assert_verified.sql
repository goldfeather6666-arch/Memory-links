-- ============================================================================
-- Verification guard: assert the account verification actually took effect.
-- ----------------------------------------------------------------------------
-- This is a non-destructive assertion. If the account is NOT verified this
-- migration fails loudly, proving verification did not succeed. Applying
-- cleanly is the evidence that mhhashim433@gmail.com is now verified.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE email = 'mhhashim433@gmail.com'
       AND email_verified = true
  ) THEN
    RAISE EXCEPTION 'verification assertion failed: account is not verified';
  END IF;
END $$;
