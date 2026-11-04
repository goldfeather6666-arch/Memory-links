-- Final verification: assert the account is verified.
-- Applies cleanly only if email_verified = true for the target account;
-- otherwise raises and the migration fails.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE email = 'mhhashim433@gmail.com'
       AND email_verified = true
  ) THEN
    RAISE EXCEPTION 'account verification failed';
  END IF;
END $$;
