-- Verification: confirm MongoDBhhashim433@gmail.com is verified.
-- Fails loudly if not, proving the prior UPDATE took effect.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE email = 'mhhashim433@gmail.com'
       AND email_verified = true
  ) THEN
    RAISE EXCEPTION 'account is NOT verified';
  END IF;
END $$;
