-- Final idempotent verification assertion.
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
